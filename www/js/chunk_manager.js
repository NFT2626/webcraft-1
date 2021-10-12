import {Vector, SpiralGenerator, VectorCollector} from "./helpers.js";
import Chunk from "./chunk.js";
import {BLOCK} from "./blocks.js";
import ServerClient from "./server_client.js";

const CHUNKS_ADD_PER_UPDATE = 16;

export const MAX_Y_MARGIN = 3;

//
export class ChunkManager {

    constructor(world) {
        let that                    = this;
        this.CHUNK_RENDER_DIST      = 4; // 0(1chunk), 1(9), 2(25chunks), 3(45), 4(69), 5(109), 6(145), 7(193), 8(249) 9(305) 10(373) 11(437) 12(517)
        this.chunks                 = new VectorCollector(), // Map();
        this.chunks_prepare         = new VectorCollector();
        this.modify_list            = {};
        this.world                  = world;
        this.margin                 = Math.max(this.CHUNK_RENDER_DIST + 1, 1);
        this.rendered_chunks        = {fact: 0, total: 0};
        this.update_chunks          = true;
        this.vertices_length_total  = 0;
        this.dirty_chunks           = [];
        this.worker                 = new Worker('./js/chunk_worker.js'/*, {type: 'module'}*/);
        //
        this.DUMMY = {
            id: BLOCK.DUMMY.id,
            shapes: [],
            properties: BLOCK.DUMMY,
            material: BLOCK.DUMMY,
            getProperties: function() {
                return this.properties;
            }
        };
        this.AIR = {
            id: BLOCK.AIR.id,
            properties: BLOCK.AIR
        };
        // Message received from worker
        this.worker.onmessage = function(e) {
            let cmd = e.data[0];
            let args = e.data[1];
            switch(cmd) {
                case 'blocks_generated': {
                    let chunk = that.chunks.get(args.addr);
                    if(chunk) {
                        chunk.onBlocksGenerated(args);
                    }
                    break;
                }
                case 'vertices_generated': {
                    for(let result of args) {
                        let chunk = that.chunks.get(result.addr);
                        if(chunk) {
                            chunk.onVerticesGenerated(result);
                        }
                    }
                    break;
                }
            }
        }
        // Init webworker
        this.postWorkerMessage(['init', world.saved_state.generator, world.seed, world.saved_state.id]);
    }

    //
    setRenderDist(value) {
        value = Math.max(value, 4);
        value = Math.min(value, 16);
        this.CHUNK_RENDER_DIST = value;
        this.margin = Math.max(this.CHUNK_RENDER_DIST + 1, 1)
    }

    // toggleUpdateChunks
    toggleUpdateChunks() {
        this.update_chunks = !this.update_chunks;
    }

    // refresh
    refresh() {
    }

    // Draw level chunks
    draw(render, transparent) {
        let applyVerticesCan        = 10;
        let groups = [];
        if(transparent) {
            groups = ['transparent', 'doubleface_transparent'];
        } else {
            groups = ['regular', 'doubleface'];
        }
        let vc = new VectorCollector();
        for(let group of groups) {
            const mat = render.materials[group];
            for(let item of this.poses) {
                if(item.chunk) {
                    if(item.chunk.need_apply_vertices) {
                        if(applyVerticesCan-- > 0) {
                            item.chunk.applyVertices();
                        }
                    }
                    if(item.chunk.vertices_length > 0) {
                        if(item.chunk.drawBufferGroup(render.renderBackend, group, mat)) {
                            vc.add(item.addr, null);
                        }
                    }
                }
            }
        }
        this.rendered_chunks.fact = vc.size;
        return true;
    }

    // Get
    getChunk(addr) {
        return this.chunks.get(addr);
    }

    // Add
    addChunk(item) {
        if(this.chunks.has(item.addr) || this.chunks_prepare.has(item.addr)) {
            return false;
        }
        this.chunks_prepare.add(item.addr, {
            start_time: performance.now()
        });
        this.world.server.ChunkAdd(item.addr);
        return true;
    }

    // Remove
    removeChunk(addr) {
        let chunk = this.chunks.get(addr);
        this.vertices_length_total -= chunk.vertices_length;
        chunk.destruct();
        this.chunks.delete(addr)
        this.rendered_chunks.total--;
        this.world.server.ChunkRemove(addr);
    }

    // postWorkerMessage
    postWorkerMessage(data) {
        this.worker.postMessage(data);
    };

    // Установить начальное состояние указанного чанка
    setChunkState(state) {
        let prepare = this.chunks_prepare.get(state.pos);
        if(prepare) {
            let chunk       = new Chunk(state.pos, state.modify_list);
            chunk.load_time = performance.now() - prepare.start_time;
            this.chunks.add(state.pos, chunk);
            this.rendered_chunks.total++;
            this.chunks_prepare.delete(state.pos);
        }
    }

    // Update
    update() {
        if(!this.update_chunks) {
            return false;
        }
        let world = this.world;
        if(!world.localPlayer) {
            return;
        }
        var spiral_moves_3d = SpiralGenerator.generate3D(new Vector(this.margin, MAX_Y_MARGIN, this.margin));
        let chunkAddr = BLOCK.getChunkAddr(world.localPlayer.pos.x, world.localPlayer.pos.y, world.localPlayer.pos.z);
        if(!this.chunkAddr || this.chunkAddr.distance(chunkAddr) > 0 || !this.prev_margin || this.prev_margin != this.margin) {
            this.poses = [];
            this.prev_margin = this.margin;
            this.chunkAddr = chunkAddr;
            for(let sm of spiral_moves_3d) {
                let addr = chunkAddr.add(sm.pos);
                if(addr.y >= 0) {
                    this.poses.push({
                        addr:   addr,
                        chunk:  null
                    });
                }
            }
        }
        if(this.chunks.size != this.poses.length || (this.prevchunkAddr && this.prevchunkAddr.distance(chunkAddr) > 0)) {
            this.prevchunkAddr = chunkAddr;
            let can_add = CHUNKS_ADD_PER_UPDATE;
            // Помечаем часть чанков неживымии и запрещаем в этом Update добавление чанков
            for(let chunk of this.chunks) {
                if(!chunk.inited) {
                    can_add = 0;
                    break;
                }
                chunk.isLive = false;
            }
            // Check for add
            for(let item of this.poses) {
                if(item.addr.y >= 0) {
                    if(can_add > 0) {
                        if(this.addChunk(item)) {
                            can_add--;
                        }
                    }
                }
                if(!item.chunk) {
                    item.chunk = this.chunks.get(item.addr);
                }
                if(item.chunk) {
                    item.chunk.isLive = true;
                }
            }
            // Check for remove chunks
            for(let chunk of this.chunks) {
                if(!chunk.isLive) {
                    this.removeChunk(chunk.addr);
                }
            }
        }

        // Build dirty chunks
        for(let chunk of this.dirty_chunks) {
            if(chunk.dirty && !chunk.buildVerticesInProgress) {
                if(
                    this.getChunk(new Vector(chunk.addr.x - 1, chunk.addr.y, chunk.addr.z)) &&
                    this.getChunk(new Vector(chunk.addr.x + 1, chunk.addr.y, chunk.addr.z)) &&
                    this.getChunk(new Vector(chunk.addr.x, chunk.addr.y, chunk.addr.z - 1)) &&
                    this.getChunk(new Vector(chunk.addr.x, chunk.addr.y, chunk.addr.z + 1))
                ) {
                    chunk.buildVertices();
                }
            }
        }

    }

    addToDirty(chunk) {
        this.dirty_chunks.push(chunk);
    }

    deleteFromDirty(chunk_key) {
        for(let i in this.dirty_chunks) {
            let chunk = this.dirty_chunks[i];
            if(chunk.key == chunk_key) {
                this.dirty_chunks.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * getPosChunkKey...
     * @param {Vector} pos 
     * @returns string
     */
    getPosChunkKey(pos) {
        if(pos instanceof Vector) {
            return pos.toChunkKey();
        }
        return new Vector(pos.x, pos.y, pos.z).toChunkKey();
    }

    // Возвращает блок по абслютным координатам
    getBlock(x, y, z) {
        let addr = BLOCK.getChunkAddr(x, y, z);
        let chunk = this.chunks.get(addr);
        if(chunk) {
            return chunk.getBlock(x, y, z);
        }
        return this.DUMMY;
    }

    // setBlock
    setBlock(x, y, z, block, is_modify, power, rotate, entity_id, extra_data) {
        // определяем относительные координаты чанка
        let chunkAddr = BLOCK.getChunkAddr(x, y, z);
        // обращаемся к чанку
        let chunk = this.getChunk(chunkAddr);
        // если чанк найден
        if(!chunk) {
            return null;
        }
        let pos = new Vector(x, y, z);
        let item = {
            id:         block.id,
            power:      power ? power : 1.0,
            rotate:     rotate,
            entity_id:  entity_id,
            extra_data: extra_data ? extra_data : null
        };
        if(is_modify) {
            // @server Отправляем на сервер инфу об установке блока
            this.world.server.Send({
                name: ServerClient.EVENT_BLOCK_SET,
                data: {
                    pos: pos,
                    item: item
                }
            });
            // заменяемый блок
            let world_block = chunk.getBlock(pos.x, pos.y, pos.z);
            let b = null;
            let action = null;
            if(block.id == BLOCK.AIR.id) {
                // dig
                action = 'dig';
                b = world_block;
            } else if(world_block && world_block.id == block.id) {
                // do nothing
            } else {
                // place
                action = 'place';
                b = block;
            }
            if(action) {
                b = BLOCK.BLOCK_BY_ID[b.id];
                if(b.hasOwnProperty('sound')) {
                    Game.sounds.play(b.sound, action);
                }
            }
        }
        // устанавливаем блок
        return chunk.setBlock(pos.x, pos.y, pos.z, block, false, item.power, item.rotate, item.entity_id, extra_data);
    }

    // destroyBlock
    destroyBlock(pos, is_modify) {
        let block = this.getBlock(pos.x, pos.y, pos.z);
        if(block.id == BLOCK.TULIP.id) {
            this.world.renderer.setBrightness(.15);
        } else if(block.id == BLOCK.DANDELION.id) {
            this.world.renderer.setBrightness(1);
        } else if(block.id == BLOCK.CACTUS.id) {
            this.world.setRain(true);
        }
        this.world.destroyBlock(block, pos);
        this.setBlock(pos.x, pos.y, pos.z, BLOCK.AIR, true);
    }

}