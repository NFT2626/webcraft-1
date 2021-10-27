import {Label, Window} from "../../tools/gui/wm.js";

export class CraftTableSlot extends Label {

    constructor(x, y, w, h, id, title, text, ct, slot_index) {
        super(x, y, w, h, id, null, null);
        this.ct = ct;
        this.setSlotIndex(slot_index);
    }

    setItem(item) {
        if(this.slot_index !== null) {
            Game.world.localPlayer.inventory.setItem(this.slot_index, item);
        } else {
            this.item = item;
        }
    }

    getItem() {
        if(this.slot_index !== null) {
            return Game.world.localPlayer.inventory.items[this.slot_index];
        } else {
            return this.item;
        }
    }

    draw(ctx, ax, ay) {
        this.applyStyle(ctx, ax, ay);
        let item = this.getItem();
        this.drawItem(ctx, item, ax + this.x, ay + this.y, this.width, this.height);
        super.draw(ctx, ax, ay);
    }

    drawItem(ctx, item, x, y, width, height) {
        if(!this.ct.inventory.inventory_image) {
            return;
        }
        if(!item) {
            return;
        }
        ctx.imageSmoothingEnabled = false;
        // 
        if('inventory_icon_id' in item) {
            let icon = BLOCK.getInventoryIconPos(item.inventory_icon_id);
            ctx.drawImage(
                this.ct.inventory.inventory_image,
                icon.x,
                icon.y,
                icon.width,
                icon.height,
                x + width / 2 - icon.width / 2,
                y + height / 2 - icon.height / 2,
                32,
                32
            );
        } else {
            ctx.textBaseline    = 'top';
            ctx.textAlign       = 'left';
            ctx.font            = '11px Minecraftia';
            let text            = item.name.substring(0, 4);
            ctx.fillStyle       = '#000000ff';
            ctx.fillText(text, x + 2, y + 2);
            ctx.fillStyle       = '#ffffffff';
            ctx.fillText(text, x + 1, y + 1);
        }
        if(item.count > 1) {
            ctx.textBaseline        = 'bottom';
            ctx.textAlign           = 'right';
            ctx.font                = '18px Minecraftia';
            ctx.fillStyle           = '#000000ff';
            ctx.fillText(item.count, x + width + 2, y + height + 2);
            ctx.fillStyle           = '#ffffffff';
            ctx.fillText(item.count, x + width, y + height);
        }
        // Draw instrument life
        if(item.instrument_id && item.power < 1) {
            let cx = x + 4;
            let cy = y + 3;
            let cw = width - 8;
            let ch = height - 6;
            ctx.fillStyle = '#000000ff';
            ctx.fillRect(cx, cy + ch - 6, cw, 6);
            //
            let rgb = Helpers.getColorForPercentage(item.power);
            ctx.fillStyle = rgb.toCSS();
            ctx.fillRect(cx, cy + ch - 6, cw * item.power | 0, 4);
        }
    }

    setSlotIndex(index) {
        this.slot_index = index;
    }

}

//
export class CraftTableResultSlot extends CraftTableSlot {

    constructor(x, y, w, h, id, title, text, ct) {

        super(x, y, w, h, id, title, text, ct, null);

        this.onDrop = function(e) {
            let that = this;
            let dragItem = this.getItem();
            let dropItem = e.drag.getItem().item;
            if(!dragItem || !dropItem) {
                return;
            }
            if(dragItem.id != dropItem.id) {
                return;
            }
            // decrement craft slots
            for(let slot of this.parent.craft.slots) {
                let item = slot.getItem();
                if(item) {
                    item.count--;
                    if(item.count == 0) {
                        slot.setItem(null);
                    }
                }
            }
            //
            const MAX_COUNT = 64;
            if(dropItem.count + dragItem.count < MAX_COUNT) {
                dropItem.count += dragItem.count;
                // clear result slot
                this.setItem(null);
            } else {
                let remains = (dropItem.count + dragItem.count) - MAX_COUNT;
                dropItem.count = MAX_COUNT;
                dragItem.count = remains;
            }
            this.parent.checkRecipe();
        }

        // Drag & drop
        this.onMouseDown = function(e) {
            let that = this;
            let dragItem = this.getItem();
            if(!dragItem) {
                return;
            }
            // clear result slot
            this.setItem(null);
            // decrement craft slots
            for(let slot of this.parent.craft.slots) {
                let item = slot.getItem();
                if(item) {
                    item.count--;
                    if(item.count == 0) {
                        slot.setItem(null);
                    }
                }
            }
            // set drag item
            e.drag.setItem({
                draw: function(e) {
                    that.drawItem(e.ctx, dragItem, e.x, e.y, that.width, that.height);
                },
                item: dragItem
            });
            this.parent.checkRecipe();
        }
    
    }
    
}

export class CraftTableInventorySlot extends CraftTableSlot {

    constructor(x, y, w, h, id, title, text, ct, slot_index) {
        
        super(x, y, w, h, id, title, text, ct, slot_index);

        // Custom drawing
        this.onMouseEnter = function() {
            this.style.background.color = '#ffffff55';
        }

        this.onMouseLeave = function() {
            this.style.background.color = '#00000000';
        }

        // Drag & drop
        this.onMouseDown = function(e) {
            let that        = this;
            //
            let targetItem  = this.getInventoryItem();
            // Set new drag
            if(!targetItem) {
                return;
            }
            if(e.drag.getItem()) {
                return;
            }
            let dragItem = targetItem;
            // right button (divide to 2)
            if(e.button == MOUSE.BUTTON_RIGHT && targetItem.count > 1) {
                let split_count = Math.ceil(targetItem.count / 2);
                dragItem = {...targetItem};
                dragItem.count = split_count;
                targetItem.count -= split_count;
                this.setItem(targetItem);
            } else {
                if(e.shiftKey) {
                    switch(this.parent.id) {
                        case 'frmInventory': {
                            let srcList = Game.world.localPlayer.inventory.items;
                            let srcListFirstIndexOffset = this.slot_index < 9 ? 9 : 0;
                            let targetList = this.slot_index < 9 ? srcList.slice(srcListFirstIndexOffset) : srcList.slice(srcListFirstIndexOffset, 9);
                            this.appendToList(targetItem, targetList, srcList, srcListFirstIndexOffset);
                            if(targetItem.count == 0) {
                                that.setItem(null);
                            }
                            break;
                        }
                        case 'frmChest': {
                            let srcList = e.target.is_chest_slot ? Game.world.localPlayer.inventory.items : this.parent.getSlots();
                            let srcListFirstIndexOffset = 0;
                            let targetList = srcList;
                            this.appendToList(targetItem, targetList, srcList, srcListFirstIndexOffset);
                            if(targetItem.count == 0) {
                                that.setItem(null);
                            }
                            break;
                        }
                        case 'frmCraft': {
                            let srcList = e.target.is_craft_slot ? Game.world.localPlayer.inventory.items : this.parent.getSlots();
                            let srcListFirstIndexOffset = 0;
                            let targetList = srcList;
                            this.appendToList(targetItem, targetList, srcList, srcListFirstIndexOffset);
                            if(targetItem.count == 0) {
                                that.setItem(null);
                            }
                        }
                        default: {
                            console.log('this.parent.id', this.parent.id);
                        }
                    }
                    return;
                }
                dragItem = targetItem;
                that.setItem(null);
            }
            that.dragItem = dragItem;
            e.drag.setItem({
                draw: function(e) {
                    that.drawItem(e.ctx, this.item, e.x, e.y, that.width, that.height);
                },
                item: dragItem
            });
            this.prev_mousedown_time = performance.now();
        }

        // Drag & drop
        this.onDrop = function(e) {
            let that        = this;
            let drag        = e.drag;
            // @todo check instanceof!
            // if(dropData instanceof InventoryItem) {
            let dropData    = drag.getItem();
            let targetItem  = this.getInventoryItem();
            if(!dropData) {
                return;
            }
            let max_stack_count = dropData.item.max_in_stack;
            //
            if(this.prev_mousedown_time && e.button === MOUSE.BUTTON_LEFT && !e.shiftKey) {
                // 1. Объединение мелких ячеек в одну при двойном клике на ячейке
                let doubleClick = performance.now() - this.prev_mousedown_time < 200.0;
                if(doubleClick && dropData.item.count < max_stack_count) {
                    let need_count = max_stack_count - dropData.item.count;
                    // console.log('dropData', dropData, need_count, this.parent.craft.slots);
                    // проверить крафт слоты
                    let slots = this.parent.getSlots();
                    for(let i in slots) {
                        if(need_count == 0) {
                            break;
                        }
                        const slot = slots[i];
                        if(slot && slot.item) {
                            if(slot.item.id == dropData.item.id) {
                                if(slot.item.count != max_stack_count) {
                                    let minus_count = 0;
                                    if(slot.item.count < need_count) {
                                        minus_count = slot.item.count;
                                    } else {
                                        minus_count = need_count;
                                    }
                                    need_count -= minus_count;
                                    dropData.item.count += minus_count;
                                    slot.item.count -= minus_count;
                                    if(slot.item.count < 1) {
                                        slots[i].item = null;
                                    }
                                }
                            }
                        }
                    }
                    // проверить слоты инвентаря
                    let inventory_items = Game.world.localPlayer.inventory.items;
                    for(let i in inventory_items) {
                        if(need_count == 0) {
                            break;
                        }
                        const item = inventory_items[i];
                        if(item) {
                            if(item.id == dropData.item.id) {
                                if(item.count != max_stack_count) {
                                    let minus_count = 0;
                                    if(item.count < need_count) {
                                        minus_count = item.count;
                                    } else {
                                        minus_count = need_count;
                                    }
                                    need_count -= minus_count;
                                    dropData.item.count += minus_count;
                                    item.count -= minus_count;
                                    if(item.count < 1) {
                                        inventory_items[i] = null;
                                    }
                                }
                            }
                        }
                    }
                    return;
                }
            }
            if(!dropData.item) {
                return;
            }
            // Если в текущей ячейке что-то есть
            if(targetItem) {
                // @todo
                if(targetItem.id == dropData.item.id) {
                    // console.log(targetItem.count, max_stack_count);
                    if(targetItem.count < max_stack_count) {
                        if(e.button == MOUSE.BUTTON_RIGHT && dropData.item.count > 1) {
                            targetItem.count++;
                            dropData.item.count--;
                        } else {
                            let new_count = targetItem.count + dropData.item.count;
                            let remains = 0;
                            if(new_count > max_stack_count) {
                                remains = new_count - max_stack_count;
                                new_count = max_stack_count;
                            }
                            targetItem.count = new_count;
                            dropData.item.count = remains;
                            if(dropData.item.count <= 0) {
                                drag.clear();
                            }
                        }
                        this.setItem(targetItem);
                    }
                } else {
                    // поменять местами перетаскиваемый элемент и содержимое ячейки
                    this.setItem(dropData.item);
                    dropData.item = targetItem;
                }
            } else {
                // Перетаскивание в пустую ячейку
                if(e.button == MOUSE.BUTTON_RIGHT && dropData.item.count > 1) {
                    let newItem = {...dropData.item};
                    newItem.count = 1;
                    that.setItem(newItem);
                    dropData.item.count--;
                } else {
                    that.setItem(dropData.item);
                    drag.clear();
                }
            }
        }

    }

    /**
     * Помещает предмет в список (например инвентарный)
     * @param {*} srcItem Исходный слот для перемещения
     * @param {*} target_list Итоговый  список слотов, куда нужно переместить исходный слот
     * @param {*} srcList Ссылка на оригинальный список, чтобы можно было в него добавить/заменить новый элемент
     * @param {*} srcListFirstIndexOffset Смещение в оригинальном списке, откуда взяли target_list
     */
    appendToList(srcItem, target_list, srcList, srcListFirstIndexOffset) {
        if(typeof srcListFirstIndexOffset != 'number') {
            throw 'Invalid srcListFirstIndexOffset';
        }
        let max_stack_count = srcItem.max_in_stack;
        // 1. проход в поисках подобного
        for(let item of target_list) {
            let slot = null;
            if(item instanceof CraftTableInventorySlot) {
                slot = item;
                item = item.item;
            }
            if(item && item.id == srcItem.id) {
                let free_count = max_stack_count - item.count;
                if(free_count > 0) {
                    let count = Math.min(free_count, srcItem.count);
                    srcItem.count -= count
                    item.count += count;
                    slot.setItem(item);
                }
            }
        }
        // 2. проход в поисках свободных слотов
        if(srcItem.count > 0) {
            for(let index in target_list) {
                let item = target_list[index];
                if(item instanceof CraftTableInventorySlot) {
                    if(!item.item) {
                        let slot_index = (srcListFirstIndexOffset | 0) + (index | 0);
                        srcList[slot_index].setItem({...srcItem});
                        srcItem.count = 0;
                        break;
                    }
                } else {
                    if(!item) {
                        let slot_index = (srcListFirstIndexOffset | 0) + (index | 0);
                        srcList[slot_index] = {...srcItem};
                        srcItem.count = 0;
                        break;
                    }
                }
            }
        }
    }

    draw(ctx, ax, ay) {
        this.applyStyle(ctx, ax, ay);
        let item = this.getInventoryItem();
        this.drawItem(ctx, item, ax + this.x, ay + this.y, this.width, this.height);
        super.draw(ctx, ax, ay);
    }

    getInventoryItem() {
        return this.ct.inventory.items[this.slot_index] || this.item;
    }
    
}

// Ячейка рецепта
export class CraftTableRecipeSlot extends CraftTableInventorySlot {

    // Вызывается после изменения любой из её ячеек
    setItem(item) {
        super.setItem(item);
        this.parent.checkRecipe();
    }

}

export class BaseCraftWindow extends Window {

    /**
    * Итоговый слот (то, что мы получим)
    */
     createResultSlot(x, y) {
        const ct = this;
        // x, y, w, h, id, title, text, ct, slot_index
        let lblResultSlot = this.resultSlot = new CraftTableResultSlot(x, y, this.cell_size, this.cell_size, 'lblCraftResultSlot', null, null, ct);
        lblResultSlot.onMouseEnter = function() {
            this.style.background.color = '#ffffff33';
        }
        lblResultSlot.onMouseLeave = function() {
            this.style.background.color = '#00000000';
        }
        ct.add(lblResultSlot);
    }

    /**
    * Создание слотов для инвентаря
    * @param int sz Ширина / высота слота
    */
     createInventorySlots(sz) {
        const ct = this;
        if(ct.inventory_slots) {
            console.error('createInventorySlots() already created');
            return;
        }
        ct.inventory_slots  = [];
        // нижний ряд (видимые на хотбаре)
        let sx          = 14;
        let sy          = 282;
        let xcnt        = 9;
        for(let i = 0; i < 9; i++) {
            let lblSlot = new CraftTableInventorySlot(sx + (i % xcnt) * sz, sy + Math.floor(i / xcnt) * 36, sz, sz, 'lblSlot' + (i), null, '' + i, this, i);
            ct.add(lblSlot);
            ct.inventory_slots.push(lblSlot);
        }
        sx              = 14;
        sy              = 166;
        xcnt            = 9;
        // верхние 3 ряда
        for(let i = 0; i < 27; i++) {
            let lblSlot = new CraftTableInventorySlot(sx + (i % xcnt) * sz, sy + Math.floor(i / xcnt) * 36, sz, sz, 'lblSlot' + (i + 9), null, '' + (i + 9), this, i + 9);
            ct.add(lblSlot);
            ct.inventory_slots.push(lblSlot);
        }
    }

    clearCraft() {
        // Drag
        let dragItem = this.getRoot().drag.getItem();
        if(dragItem) {
            this.inventory.increment(dragItem.item);
        }
        this.getRoot().drag.clear();
        // Clear result
        this.resultSlot.setItem(null);
        //
        for(let slot of this.craft.slots) {
            if(slot && slot.item) {
                this.inventory.increment(slot.item);
                slot.item = null;
            }
        }
    }

    //
    getCurrentSlotsPattern() {
        let current_slots_pattern = [];
        for(let slot of this.craft.slots) {
            let item = slot.getItem();
            if(item) {
                current_slots_pattern.push(item.id);
            } else {
                current_slots_pattern.push(' ');
            }
        }
        return current_slots_pattern.join('').trim('').split('').map(vaue => vaue.trim() ? parseInt(vaue) : null);
    }

    // Автоматически расставить рецепт в слотах по указанному рецепту
    autoRecipe(recipe) {
        // Validate area size
        if(recipe.size.width > this.area.size.width) {
            return false;
        }
        if(recipe.size.height > this.area.size.height) {
            return false;
        }
        //
        let pattern_array = recipe.getCroppedPatternArray(this.area.size);
        // Clear current craft recipe slots and result
        // Compare current slots recipe with new, then clear if not equals
        let slot_index = 0;
        let current_slots_pattern = this.getCurrentSlotsPattern();
        if(this.recipes.patternsIsEqual(current_slots_pattern, pattern_array)) {
            // Find first item in craft slots
            for(let i in this.craft.slots) {
                let slot = this.craft.slots[i];
                let item = slot.getItem();
                if(item) {
                    slot_index = i;
                    break;
                }
            }
        } else {
            this.clearCraft();
        }
        // Fill craft slots from recipe
        for(let i in pattern_array) {
            let item_id = pattern_array[i];
            let slot = this.craft.slots[slot_index];
            let item = slot.getItem();
            if(item_id) {
                if(!item) {
                    item = Object.assign({count: 0}, BLOCK.fromId(item_id));
                    delete(item.texture);
                }
                let count = 1;
                item.count += count;
                this.inventory.decrementByItemID(item_id, count);
            } else {
                item = null;
            }
            slot.setItem(item);
            slot_index++
        }
    }

}