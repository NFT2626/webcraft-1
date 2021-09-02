import {DIRECTION, MULTIPLY, QUAD_FLAGS, ROTATE} from '../helpers.js';

// Pushes the vertices necessary for rendering a
// specific block into the array.
export function push_cube(block, vertices, world, lightmap, x, y, z, neighbours, biome) {

    if(!block || typeof block == 'undefined' || block.id == BLOCK.AIR.id) {
        return;
    }

    // Ambient occlusion
    const ao_enabled = true;
    const ao_value = .23;

    const cardinal_direction    = BLOCK.getCardinalDirection(block.rotate).z;
    let flags = 0;
    let sideFlags = 0;
    let upFlags = 0;

    // Texture color multiplier
    let lm = MULTIPLY.COLOR.WHITE;
    if(block.id == BLOCK.DIRT.id) {
        lm = biome.dirt_color; // MULTIPLY.COLOR.GRASS;
        sideFlags = QUAD_FLAGS.MASK_BIOME;
        upFlags = QUAD_FLAGS.MASK_BIOME;
    }

    let DIRECTION_UP            = DIRECTION.UP;
    let DIRECTION_DOWN          = DIRECTION.DOWN;
    let DIRECTION_BACK          = DIRECTION.BACK;
    let DIRECTION_RIGHT         = DIRECTION.RIGHT;
    let DIRECTION_FORWARD       = DIRECTION.FORWARD;
    let DIRECTION_LEFT          = DIRECTION.LEFT;

    if(!block.name) {
        console.log('block', JSON.stringify(block), block.id);
        debugger;
    }

    let c, ao, neighbourBlock;
    let width                   = block.width ? block.width : 1;
    let height                  = block.height ? block.height : 1;
    let drawAllSides            = width != 1 || height != 1;
    let texture                 = BLOCK[block.name].texture;
    let blockLit                = true;

    // F R B L
    switch(cardinal_direction) {
        case ROTATE.S: {
            break;
        }
        case ROTATE.W: {
            DIRECTION_BACK      = DIRECTION.LEFT;
            DIRECTION_RIGHT     = DIRECTION.BACK;
            DIRECTION_FORWARD   = DIRECTION.RIGHT;
            DIRECTION_LEFT      = DIRECTION.FORWARD;
            break;
        }
        case ROTATE.N: {
            DIRECTION_BACK      = DIRECTION.FORWARD;
            DIRECTION_RIGHT     = DIRECTION.LEFT;
            DIRECTION_FORWARD   = DIRECTION.BACK;
            DIRECTION_LEFT      = DIRECTION.RIGHT;
            break;
        }
        case ROTATE.E: {
            DIRECTION_BACK      = DIRECTION.RIGHT;
            DIRECTION_RIGHT     = DIRECTION.FORWARD;
            DIRECTION_FORWARD   = DIRECTION.LEFT;
            DIRECTION_LEFT      = DIRECTION.BACK;
            break;
        }
    }

    // Can change height
    let bH         = 1.0;
    if(block.fluid || [BLOCK.STILL_LAVA.id, BLOCK.STILL_WATER.id].indexOf(block.id) >= 0) {
        bH = Math.min(block.power, .9)
        let blockOver  = world.chunkManager.getBlock(x, y + 1, z);
        if(blockOver) {
            let blockOverIsFluid = (blockOver.fluid || [BLOCK.STILL_LAVA.id, BLOCK.STILL_WATER.id].indexOf(blockOver.id) >= 0);
            if(blockOverIsFluid) {
                bH = 1.0;
            }
        }
    }

    if(block.id == BLOCK.DIRT.id || block.id == BLOCK.SNOW_DIRT.id) {
        if(neighbours.UP && !neighbours.UP.transparent) {
            DIRECTION_BACK      = DIRECTION.DOWN;
            DIRECTION_RIGHT     = DIRECTION.DOWN;
            DIRECTION_FORWARD   = DIRECTION.DOWN;
            DIRECTION_LEFT      = DIRECTION.DOWN;
            sideFlags = 0;
        }
    }

    // Top
    neighbourBlock = neighbours.UP;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent || block.fluid) {
        ao = [0, 0, 0, 0];
        if(ao_enabled) {
            let aa = this.getCachedBlock(x, y + 1, z - 1);
            let ab = this.getCachedBlock(x - 1, y + 1, z);
            let ac = this.getCachedBlock(x - 1, y + 1, z - 1);
            let ad = this.getCachedBlock(x, y + 1, z + 1);
            let ae = this.getCachedBlock(x + 1, y + 1, z);
            let af = this.getCachedBlock(x + 1, y + 1, z + 1);
            let ag = this.getCachedBlock(x - 1, y + 1, z + 1);
            let ah = this.getCachedBlock(x + 1, y + 1, z - 1);
            let aj = this.getCachedBlock(x, y + 1, z);
            if(this.visibleForAO(aa)) {ao[0] = ao_value; ao[1] = ao_value;}
            if(this.visibleForAO(ab)) {ao[0] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ac)) {ao[0] = ao_value; }
            if(this.visibleForAO(ad)) {ao[2] = ao_value; ao[3] = ao_value; }
            if(this.visibleForAO(ae)) {ao[1] = ao_value; ao[2] = ao_value; }
            if(this.visibleForAO(af)) {ao[2] = ao_value;}
            if(this.visibleForAO(ag)) {ao[3] = ao_value;}
            if(this.visibleForAO(ah)) {ao[1] = ao_value;}
            if(this.visibleForAO(aj)) {ao[0] = ao_value; ao[1] = ao_value; ao[2] = ao_value; ao[3] = ao_value;}
        }
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_UP));
        // n = NORMALS.UP;
        vertices.push(x + 0.5, z + 0.5, y + bH - 1 + height,
            1, 0, 0,
            0, 1, 0,
            c[0], c[1], c[2], c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | upFlags);
    }

    // Waters
    if([200, 202].indexOf(block.id) >= 0) {
        return;
    }

    // Bottom
    neighbourBlock = neighbours.DOWN;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent) {
        ao = [.5, .5, .5, .5];
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_DOWN));
        vertices.push(x + 0.5, z + 0.5, y,
            1, 0, 0,
            0, -1, 0,
            c[0], c[1], c[2], c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags);
    }

    // South | Front/Forward
    neighbourBlock = neighbours.FORWARD;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent) {
        ao = [0, 0, 0, 0];
        if(ao_enabled) {
            // ao[0] - левый нижний
            // ao[1] - правый нижний
            // ao[2] - правый верхний
            // ao[3] - левый верхний
            let aa = this.getCachedBlock(x - 1, y, z - 1);
            let ab = this.getCachedBlock(x + 1, y, z - 1);
            let ac = this.getCachedBlock(x, y - 1, z - 1);
            let ad = this.getCachedBlock(x + 1, y - 1, z - 1);
            let ae = this.getCachedBlock(x, y + 1, z - 1);
            let af = this.getCachedBlock(x + 1, y + 1, z - 1);
            let ag = this.getCachedBlock(x - 1, y - 1, z - 1);
            let ah = this.getCachedBlock(x - 1, y + 1, z - 1);
            let aj = this.getCachedBlock(x, y, z - 1); // to South
            if(this.visibleForAO(aa)) {ao[0] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ab)) {ao[1] = ao_value; ao[2] = ao_value;}
            if(this.visibleForAO(ac)) {ao[0] = ao_value; ao[1] = ao_value;}
            if(this.visibleForAO(ad)) {ao[1] = ao_value;}
            if(this.visibleForAO(ae)) {ao[2] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(af)) {ao[2] = ao_value;}
            if(this.visibleForAO(ag)) {ao[0] = ao_value;}
            if(this.visibleForAO(ah)) {ao[3] = ao_value;}
            if(this.visibleForAO(aj)) {ao[0] = ao_value; ao[1] = ao_value; ao[2] = ao_value; ao[3] = ao_value;}
        }
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_FORWARD));
        vertices.push(x + .5, z + .5 - width / 2, y + bH / 2,
            1, 0, 0,
            0, 0, bH,
            c[0], c[1], c[2], -c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
    }

    // North | Back
    neighbourBlock = neighbours.BACK;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent) {
        ao = [0, 0, 0, 0];
        if(ao_enabled) {
            // ao[0] - правый верхний
            // ao[1] - левый верхний
            // ao[2] - левый нижний
            // ao[3] - правый нижний
            let aa = this.getCachedBlock(x + 1, y - 1, z + 1);
            let ab = this.getCachedBlock(x, y - 1, z + 1);
            let ac = this.getCachedBlock(x + 1, y, z + 1);
            let ad = this.getCachedBlock(x - 1, y, z + 1);
            let ae = this.getCachedBlock(x - 1, y - 1, z + 1);
            let af = this.getCachedBlock(x, y + 1, z + 1);
            let ag = this.getCachedBlock(x - 1, y + 1, z + 1);
            let ah = this.getCachedBlock(x + 1, y + 1, z + 1);
            let aj = this.getCachedBlock(x, y, z + 1); // to North
            if(this.visibleForAO(aa)) {ao[2] = ao_value;}
            if(this.visibleForAO(ab)) {ao[2] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ac)) {ao[1] = ao_value; ao[2] = ao_value;}
            if(this.visibleForAO(ad)) {ao[0] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ae)) {ao[3] = ao_value;}
            if(this.visibleForAO(af)) {ao[0] = ao_value; ao[1] = ao_value;}
            if(this.visibleForAO(ag)) {ao[0] = ao_value;}
            if(this.visibleForAO(ah)) {ao[1] = ao_value;}
            if(this.visibleForAO(aj)) {ao[0] = ao_value; ao[1] = ao_value; ao[2] = ao_value; ao[3] = ao_value;}
        }
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_BACK));
        vertices.push(x + .5, z + .5 + width / 2, y + bH / 2,
            1, 0, 0,
            0, 0, -bH,
            c[0], c[1], -c[2], c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
    }

    // West | Left
    neighbourBlock = neighbours.LEFT;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent) {
        ao = [0, 0, 0, 0];
        if(ao_enabled) {
            // ao[0] - правый верхний
            // ao[1] - левый верхний
            // ao[2] - левый нижний
            // ao[3] - правый нижний
            let aa = this.getCachedBlock(x - 1, y - 1, z - 1);
            let ab = this.getCachedBlock(x - 1, y - 1, z);
            let ac = this.getCachedBlock(x - 1, y - 1, z + 1);
            let ad = this.getCachedBlock(x - 1, y, z - 1);
            let ae = this.getCachedBlock(x - 1, y, z + 1);
            let af = this.getCachedBlock(x - 1, y + 1, z - 1);
            let ag = this.getCachedBlock(x - 1, y + 1, z);
            let ah = this.getCachedBlock(x - 1, y + 1, z + 1);
            let aj = this.getCachedBlock(x - 1, y, z); // to West
            if(this.visibleForAO(aa)) {ao[3] = ao_value;}
            if(this.visibleForAO(ab)) {ao[2] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ac)) {ao[2] = ao_value;}
            if(this.visibleForAO(ad)) {ao[0] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ae)) {ao[1] = ao_value; ao[2] = ao_value;}
            if(this.visibleForAO(af)) {ao[0] = ao_value;}
            if(this.visibleForAO(ag)) {ao[0] = ao_value; ao[1] = ao_value;}
            if(this.visibleForAO(ah)) {ao[1] = ao_value;}
            if(this.visibleForAO(aj)) {ao[0] = ao_value; ao[1] = ao_value; ao[2] = ao_value; ao[3] = ao_value;}
        }
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_LEFT));
        vertices.push(x + .5 - width / 2, z + .5, y + bH / 2,
            0, 1, 0,
            0, 0, -bH,
            c[0], c[1], -c[2], c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
    }

    // East | Right
    neighbourBlock = neighbours.RIGHT;
    if(drawAllSides || !neighbourBlock || neighbourBlock.transparent) {
        ao = [0, 0, 0, 0];
        if(ao_enabled) {
            // ao[0] - левый нижний
            // ao[1] - правый нижний
            // ao[2] - правый верхний
            // ao[3] - левый верхний
            let aa = this.getCachedBlock(x + 1, y, z - 1);
            let ab = this.getCachedBlock(x + 1, y, z + 1);
            let ac = this.getCachedBlock(x + 1, y - 1, z);
            let ad = this.getCachedBlock(x + 1, y - 1, z + 1);
            let ae = this.getCachedBlock(x + 1, y + 1, z + 1);
            let af = this.getCachedBlock(x + 1, y - 1, z - 1);
            let ag = this.getCachedBlock(x + 1, y + 1, z);
            let ah = this.getCachedBlock(x + 1, y + 1, z - 1);
            let aj = this.getCachedBlock(x + 1, y, z); // to East
            if(this.visibleForAO(aa)) {ao[0] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ab)) {ao[1] = ao_value; ao[2] = ao_value;}
            if(this.visibleForAO(ac)) {ao[0] = ao_value; ao[1] = ao_value;}
            if(this.visibleForAO(ad)) {ao[1] = ao_value;}
            if(this.visibleForAO(ae)) {ao[2] = ao_value;}
            if(this.visibleForAO(af)) {ao[0] = ao_value;}
            if(this.visibleForAO(ag)) {ao[2] = ao_value; ao[3] = ao_value;}
            if(this.visibleForAO(ah)) {ao[3] = ao_value;}
            if(this.visibleForAO(aj)) {ao[0] = ao_value; ao[1] = ao_value; ao[2] = ao_value; ao[3] = ao_value;}
        }
        c = BLOCK.calcTexture(texture(world, lightmap, blockLit, x, y, z, DIRECTION_RIGHT));
        vertices.push(x + .5 + width / 2, z + .5, y + bH / 2,
            0, 1, 0,
            0, 0, bH,
            c[0], c[1], c[2], -c[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
    }

}