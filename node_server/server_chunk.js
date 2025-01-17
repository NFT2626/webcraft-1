import {CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z, CHUNK_SIZE} from "../www/js/chunk.js";
import {ServerClient} from "../www/js/server_client.js";
import {Vector, VectorCollector} from "../www/js/helpers.js";
import {BLOCK} from "../www/js/blocks.js";
import {TypedBlocks} from "../www/js/typed_blocks.js";

export const CHUNK_STATE_NEW               = 0;
export const CHUNK_STATE_LOADING           = 1;
export const CHUNK_STATE_LOADED            = 2;
export const CHUNK_STATE_BLOCKS_GENERATED  = 3;
export const STAGE_TIME_MUL                = 5; // 20;

export class ServerChunk {

    constructor(world, addr) {
        this.world          = world;
        this.size           = new Vector(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
        this.addr           = new Vector(addr);
        this.coord          = this.addr.mul(this.size);
        this.connections    = new Map();
        this.preq           = new Map();
        this.modify_list    = new Map();
        this.ticking_blocks = new Map();
        this.mobs           = new Map();
        this.drop_items     = new Map();
        this.setState(CHUNK_STATE_NEW);
    }

    // Set chunk init state
    setState(state_id) {
        this.load_state = state_id;
    }

    // Load state from DB
    async load() {
        if(this.load_state > CHUNK_STATE_NEW) {
            return;
        }
        this.setState(CHUNK_STATE_LOADING);
        if(this.world.chunkHasModifiers(this.addr)) {
            this.modify_list = await this.world.db.loadChunkModifiers(this.addr, this.size);
            this.ticking = new Map();
            let block = null;
            let pos = new Vector(0, 0, 0);
            for(let k of this.modify_list.keys()) {
                let temp = k.split(',');
                pos.set(temp[0] | 0, temp[1] | 0, temp[2] | 0);
                // If chest
                let chest = this.world.chests.getOnPos(pos);
                if(chest) {
                    this.modify_list.set(k, chest.entity.item);
                }
                const m = this.modify_list.get(k);
                if(!block || block.id != m.id) {
                    block = BLOCK.fromId(m.id);
                }
                if(block.ticking && m.extra_data && !('notick' in m.extra_data)) {
                    this.addTickingBlock(pos, block);
                }
            }
        }
        this.setState(CHUNK_STATE_LOADED);
        // Send requet to worker for create blocks structure
        this.world.chunks.postWorkerMessage(['createChunk', {
            update:         true,
            size:           this.size,
            coord:          this.coord,
            addr:           this.addr,
            modify_list:    Object.fromEntries(this.modify_list)
        }]);
        // Разошлем чанк игрокам, которые его запросили
        if(this.preq.size > 0) {
            this.sendToPlayers(Array.from(this.preq.keys()));
            this.preq.clear();
        }
    }

    // Add player connection
    addPlayer(player) {
        this.connections.set(player.session.user_id, player);
        player.addChunk(this);
    }

    // Добавление игрока, которому после прогрузки чанка нужно будет его отправить
    addPlayerLoadRequest(player) {
        if(this.load_state < CHUNK_STATE_LOADED) {
            return this.preq.set(player.session.user_id, player);
        }
        this.sendToPlayers([player.session.user_id]);
        if(this.load_state > CHUNK_STATE_LOADED) {
            this.sendMobs([player.session.user_id]);
            this.sendDropItems([player.session.user_id]);
        }
    }

    // Remove player from chunk
    removePlayer(player) {
        if(this.connections.has(player.session.user_id)) {
            this.connections.delete(player.session.user_id);
            // Unload mobs for player
            // @todo перенести выгрузку мобов на сторону игрока, пусть сам их выгружает, в момент выгрузки чанков
            if(this.mobs.size > 0) {
                let packets = [{
                    name: ServerClient.CMD_MOB_DELETED,
                    data: Array.from(this.mobs.keys())
                }];
                this.world.sendSelected(packets, [player.session.user_id], []);
            }
            if(this.drop_items.size > 0) {
                let packets = [{
                    name: ServerClient.CMD_DROP_ITEM_DELETED,
                    data: Array.from(this.drop_items.keys())
                }];
                this.world.sendSelected(packets, [player.session.user_id], []);
            }
        }
        if(this.connections.size < 1) {
            // помечает чанк невалидным, т.к. его больше не видит ни один из игроков
            // в следующем тике мира, он будет выгружен
            this.world.chunks.invalidate(this);
        }
    }

    // Add mob
    addMob(mob) {
        this.mobs.set(mob.entity_id, mob);
        let packets = [{
            name: ServerClient.CMD_MOB_ADDED,
            data: [mob]
        }];
        this.sendAll(packets);
    }

    // Add drop item
    addDropItem(drop_item) {
        this.drop_items.set(drop_item.entity_id, drop_item);
        let packets = [{
            name: ServerClient.CMD_DROP_ITEM_ADDED,
            data: [drop_item]
        }];
        this.sendAll(packets);
    }

    // Send chunk for players
    sendToPlayers(player_ids) {
        // @CmdChunkState
        let packets = [{
            name: ServerClient.CMD_CHUNK_LOADED,
            data: {
                addr:        this.addr,
                modify_list: Object.fromEntries(this.modify_list),
            }
        }];
        this.world.sendSelected(packets, player_ids, []);
        return true
    }

    sendMobs(player_user_ids) {
        // Send all mobs in this chunk
        if (this.mobs.size < 1) {
            return;
        }
        let packets_mobs = [{
            name: ServerClient.CMD_MOB_ADDED,
            data: []
        }];
        for(const [_, mob] of this.mobs) {
            packets_mobs[0].data.push(mob);
        }
        this.world.sendSelected(packets_mobs, player_user_ids, []);
    }

    sendDropItems(player_user_ids) {
        // Send all drop items in this chunk
        if (this.drop_items.size < 1) {
            return;
        }
        let packets = [{
            name: ServerClient.CMD_DROP_ITEM_ADDED,
            data: []
        }];
        for(const [_, drop_item] of this.drop_items) {
            packets[0].data.push(drop_item);
        }
        this.world.sendSelected(packets, player_user_ids, []);
    }

    // onBlocksGenerated ... Webworker callback method
    async onBlocksGenerated(args) {
        this.tblocks = new TypedBlocks(this.coord);
        this.tblocks.restoreState(args.tblocks);
        //
        this.mobs = await this.world.db.loadMobs(this.addr, this.size);
        this.drop_items = await this.world.db.loadDropItems(this.addr, this.size);
        this.setState(CHUNK_STATE_BLOCKS_GENERATED);
        // Разошлем мобов всем игрокам, которые "контроллируют" данный чанк
        if(this.connections.size > 0) {
            if(this.mobs.size > 0) {
                this.sendMobs(Array.from(this.connections.keys()));
            }
            if(this.drop_items.size > 0) {
                this.sendDropItems(Array.from(this.connections.keys()));
            }
        }
    }

    // Return block key
    getBlockKey(pos) {
        return new Vector(pos).toHash();
    }

    //
    sendAll(packets, except_players) {
        let connections = Array.from(this.connections.keys());
        this.world.sendSelected(packets, connections, except_players);
    }

    getChunkManager() {
        return this.world.chunks;
    }

    // Get the type of the block at the specified position.
    // Mostly for neatness, since accessing the array
    // directly is easier and faster.
    getBlock(pos, y, z) {
        if(this.load_state != CHUNK_STATE_BLOCKS_GENERATED) {
            return this.getChunkManager().DUMMY;
        }

        if (typeof pos == 'number') {
            pos = new Vector(pos, y, z);
        } else if (typeof pos == 'Vector') {
            // do nothing
        } else if (typeof pos == 'object') {
            pos = new Vector(pos);
        }

        pos = pos.floored().sub(this.coord);
        if(pos.x < 0 || pos.y < 0 || pos.z < 0 || pos.x >= this.size.x || pos.y >= this.size.y || pos.z >= this.size.z) {
            return this.getChunkManager().DUMMY;
        }
        let block = this.tblocks.get(pos);
        return block;
    }

    // getBlockAsItem
    getBlockAsItem(pos, y, z) {
        const block = this.getBlock(pos, y, z);
        return BLOCK.convertItemToDBItem(block);
    }

    // onBlockSet
    async onBlockSet(item_pos, item) {
        switch(item.id) {
            // 1. Make snow golem
            case BLOCK.LIT_PUMPKIN.id: {
                let pos = item_pos.clone();
                pos.y--;
                let under1 = this.world.getBlock(pos.clone());
                pos.y--;
                let under2 = this.world.getBlock(pos.clone());
                if(under1?.id == BLOCK.SNOW_BLOCK.id && under2?.id == BLOCK.SNOW_BLOCK.id) {
                    pos.addSelf(new Vector(.5, 0, .5));
                    const params = {
                        type           : 'snow_golem',
                        skin           : 'base',
                        pos            : pos.clone(),
                        pos_spawn      : pos.clone(),
                        rotate         : item.rotate ? new Vector(item.rotate).toAngles() : null
                    }
                    await this.world.createMob(params);
                    await this.world.applyActions(null, {blocks: {list: [
                        {pos: item_pos, item: BLOCK.AIR},
                        {pos: under1.posworld, item: BLOCK.AIR},
                        {pos: under2.posworld, item: BLOCK.AIR}
                    ]}});
                }
                break;
            }
        }
    }

    // Store in modify list
    addModifiedBlock(pos, item) {
        this.modify_list.set(pos.toHash(), item);
        if(item && item.id) {
            let block = BLOCK.fromId(item.id);
            if(block.ticking && item.extra_data && !('notick' in item.extra_data)) {
                this.addTickingBlock(pos, block);
            }
        }
    }

    //
    addTickingBlock(pos, block) {
        const k = pos.toHash();
        this.ticking_blocks.set(k, {
            pos: pos.clone(),
            block: block
        });
        this.world.chunks.addTickingChunk(this.addr);
    }

    //
    deleteTickingBlock(pos) {
        const k = pos.toHash();
        this.ticking_blocks.delete(k);
        if(this.ticking_blocks.size == 0) {
            this.world.chunks.removeTickingChunk(this.addr);
        }
    }

    // On world tick
    async tick() {
        let that = this;
        let updated_blocks = [];
        let ignore_coords = new VectorCollector();
        let check_pos = new Vector(0, 0, 0);
        for(let [k, v] of this.ticking_blocks.entries()) {
            const m = this.modify_list.get(k);
            if(!m || m.id != v.block.id) {
                this.deleteTickingBlock(v.pos);
                continue;
            }
            const ticking = v.block.ticking;
            if(Math.random() > .33) {
                if(!m.ticks) {
                    m.ticks = 0;
                }
                m.ticks++;
                switch(ticking.type) {
                    case 'bamboo': {
                        check_pos.copyFrom(v.pos);
                        check_pos.y = 0;
                        if(ignore_coords.has(check_pos)) {
                            break;
                            // continue;
                        }
                        if(m.extra_data && m.extra_data.stage < ticking.max_stage) {
                            //
                            if(m.ticks % (ticking.times_per_stage * STAGE_TIME_MUL) == 0) {
                                //
                                const world = this.world;
                                //
                                function addNextBamboo(pos, block, stage) {
                                    const next_pos = new Vector(pos);
                                    next_pos.y++;
                                    const new_item = {
                                        id: block.id,
                                        extra_data: {...block.extra_data}
                                    };
                                    new_item.extra_data.stage = stage;
                                    let b = world.getBlock(next_pos);
                                    if(b.id == 0) {
                                        updated_blocks.push({pos: next_pos, item: new_item, action_id: ServerClient.BLOCK_ACTION_CREATE});
                                        // игнорировать в этот раз все другие бамбуки на этой позиции без учета вертикальной позиции
                                        check_pos.copyFrom(next_pos);
                                        check_pos.y = 0;
                                        ignore_coords.set(check_pos, true);
                                        return true;
                                    }
                                    return false;
                                }
                                //
                                if(m.extra_data.stage == 0) {
                                    addNextBamboo(v.pos, m, 1);
                                    m.extra_data = null; // .stage = 3;
                                    updated_blocks.push({pos: new Vector(v.pos), item: m, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                } else {
                                    let over1 = world.getBlock(v.pos.add(new Vector(0, 1, 0)));
                                    let under1 = world.getBlock(v.pos.add(new Vector(0, -1, 0)));
                                    if(m.extra_data.stage == 1) {
                                        if(over1.id == 0) {
                                            if(under1.id == m.id && (!under1.extra_data || under1.extra_data.stage == 3)) {
                                                addNextBamboo(v.pos, m, 1);
                                            }
                                            if(under1.id == m.id && under1.extra_data && under1.extra_data.stage == 1) {
                                                addNextBamboo(v.pos, m, 2);
                                            }
                                        } else if(over1.id == m.id && under1.id == m.id) {
                                            if(over1.extra_data.stage == 2 && under1.extra_data && under1.extra_data.stage == 1) {
                                                if(addNextBamboo(over1.posworld, m, 2)) {
                                                    if(under1.extra_data.stage == 1) {
                                                        const new_item = {...m};
                                                        new_item.extra_data = {...new_item.extra_data};
                                                        new_item.extra_data = null; // .stage = 3;
                                                        updated_blocks.push({pos: under1.posworld, item: new_item, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        if(m.extra_data.stage == 2) {
                                            if(over1.id == m.id && under1.id == m.id) {
                                                if(over1.extra_data.stage == 2 && under1.extra_data.stage == 1) {
                                                    if(over1.posworld.distance(m.extra_data.pos) < m.extra_data.max_height - 1) {
                                                        if(addNextBamboo(over1.posworld, m, 2)) {
                                                            // replace current to 1
                                                            const new_current = {...m};
                                                            new_current.extra_data = {...new_current.extra_data};
                                                            new_current.extra_data.stage = 1;
                                                            updated_blocks.push({pos: v.pos, item: new_current, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                            // set under to 3
                                                            const new_under = {...m};
                                                            new_under.extra_data = {...new_under.extra_data};
                                                            new_under.extra_data = null; // .stage = 3;
                                                            updated_blocks.push({pos: under1.posworld, item: new_under, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                        }
                                                    } else {
                                                        // Limit height
                                                        let pos = new Vector(v.pos);
                                                        m.extra_data.notick = true;
                                                        delete(m.extra_data.pos);
                                                        delete(m.extra_data.max_height);
                                                        updated_blocks.push({pos: pos, item: m, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                        that.deleteTickingBlock(pos);
                                                        //
                                                        const new_under = {...m};
                                                        new_under.extra_data = {...under1.extra_data};
                                                        new_under.extra_data.notick = true;
                                                        delete(new_under.extra_data.pos);
                                                        delete(new_under.extra_data.max_height);
                                                        updated_blocks.push({pos: under1.posworld, item: new_under, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                        that.deleteTickingBlock(under1.posworld);
                                                        //
                                                        const new_over = {...m};
                                                        new_over.extra_data = {...over1.extra_data};
                                                        new_over.extra_data.notick = true;
                                                        delete(new_over.extra_data.pos);
                                                        delete(new_over.extra_data.max_height);
                                                        updated_blocks.push({pos: over1.posworld, item: new_over, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                                                        that.deleteTickingBlock(over1.posworld);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // Delete completed block from tickings
                            this.deleteTickingBlock(v.pos);
                        }
                        break;
                    }
                    case 'stage': {
                        if(m.extra_data && m.extra_data.stage < ticking.max_stage) {
                            if(m.ticks % (ticking.times_per_stage * STAGE_TIME_MUL) == 0) {
                                m.extra_data.stage++;
                                if(m.extra_data.stage == ticking.max_stage) {
                                    m.extra_data.complete = true;
                                }
                                updated_blocks.push({pos: new Vector(v.pos), item: m, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                            }
                        } else {
                            // Delete completed block from tickings
                            this.deleteTickingBlock(v.pos);
                        }
                        break;
                    }
                }
            }
        }
        if(updated_blocks.length > 0) {
            const actions = {blocks: {list: updated_blocks}};
            await this.world.applyActions(null, actions);
        }
    }

    // Before unload chunk
    async onUnload() {
        // Unload mobs
        if(this.mobs.size > 0) {
            for(let [entity_id, mob] of this.mobs) {
                mob.onUnload();
            }
        }
        // Unload drop items
        if(this.drop_items.size > 0) {
            for(let [entity_id, drop_item] of this.drop_items) {
                drop_item.onUnload();
            }
        }
        this.world.chunks.removeTickingChunk(this.addr);
    }

}