import RenderBatch from "../../gl/gx/RenderBatch.js";
import Box from "../../gl/Model/Box.js";
import { E } from "../../../../lib/Element.js";
import { hex, hsv2rgb } from "../../../../Util.js";

/** An instance of an object in a map. */
export class ObjInstance {
    /** Construct ObjInstance.
     *  @param {GX} gx The GX instance to use for rendering.
     *  @param {Game} game The game instance this belongs to.
     *  @param {Map} map The game map this belongs to.
     *  @param {RomListEntry} romListEntry The romlist entry that
     *   defines this object instance.
     */
    constructor(gx, game, map, romListEntry) {
        this.game  = game;
        this.map   = map;
        this.entry = romListEntry;
        this.gx    = gx;
        this.gl    = gx.gl;
        this.colorBy = 'category'; //can also be 'dll', 'group'
    }

    /** Render the object.
     *  @param {number} id The picker ID to set.
     *  @returns {RenderBatch} A batch that renders this object at
     *   its set position.
     */
    render(id) {
        const x = this.entry.position.x;
        const y = this.entry.position.y;
        const z = this.entry.position.z;
        const s = Math.max(this.entry.object.scale, 10);
        let r, g, b;
        switch(this.colorBy) {
            case 'category':
            default:
                [r,g,b] = hsv2rgb((this.entry.object.header.catId / 0x83)*360, 1, 1);
                break;

            case 'dll':
                [r,g,b] = hsv2rgb((
                    (this.entry.object.header.dll_id-171) / (704-171))*360, 1, 1);
                break;

            case 'group':
                if(this.entry.group < 0) [r,g,b] = [1,1,1];
                else [r,g,b] = hsv2rgb((this.entry.group / 32)*360, 1, 1);
                break;
        }

        const batch = new RenderBatch(this.gx);
        batch.addFunction((new Box(this.gx,
            [-0.5, -0.5, -0.5],
            [ 0.5,  0.5,  0.5],
        )).setScale(s).setPos(x,y,z).setColors(
            [r*255, g*255, b*255, 0xC0]).setId(id).batch);
        return batch;
    }

    /** Turn romlist parameters into human-readable HTML.
     *  @returns {object} Dict of name => element.
     */
    decodeParams() {
        const result = {};
        if(!this.entry.params) return result;
        for(const [name, param] of Object.entries(this.entry.params)) {
            let disp = param.value.display;
            //what the fuck
            const tp = param.value.param ? param.value.param.type : '';
            let vals = param.value.value;
            if(!Array.isArray(vals)) vals = [vals];

            //XXX this is gross and doesn't handle structs or properly
            //use the original display value
            let disps = [];
            for(let val of vals) {
                if(tp == 'ObjUniqueId') {
                    if(val > 0) {
                        const target = this.map.romList.objsByUniqueId[val];
                        if(target) {
                            disp = E.a('objlink', `0x${hex(val,8)} ${target.object.name}`);
                            //XXX connect event handler to show that object
                        }
                        else disp = `0x${hex(val,8)} (not found)`;
                    }
                }
                else if(tp == 'GameBit' || tp == 'GameBit16' || tp == 'GameBit32') {
                    const bit = this.game.bits[val & 0x7FFF];
                    disp = `0x${hex(val&0xFFFF,4)}`;
                    if(bit && bit.name) disp += ' '+bit.name;
                }
                else if(Array.isArray(val)) {
                    disp = val.join(', ');
                }
                else if(vals.length > 1) disp = String(val);
                disps.push(disp);
            }
            result[name] = E.span(null, {title:tp}, disps.join(', '));
        }
        return result;
    }
};

