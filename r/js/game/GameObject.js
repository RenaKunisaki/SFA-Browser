import { assertType, hex } from "../Util.js";
import Game from "./Game.js";

//struct types
let ObjectData;

/** An object definition in the game.
 */
export default class GameObject {
    /** Construct object with given index into OBJECTS.tab.
     */
    constructor(game, idx) {
        this.game = assertType(game, Game);
        this.app  = game.app;
        ObjectData = this.app.types.getType('sfa.objects.ObjectData');

        const objsTab = this.game.iso.getFile('/OBJECTS.tab').getData();
        const objsBin = this.game.iso.getFile('/OBJECTS.bin');
        const objsBinData = objsBin.getData();
        const offset  = objsTab.getUint32(idx*4);
        const size    = objsTab.getUint32((idx+1)*4) - offset;
        if(offset >= objsBinData.byteLength) {
            throw new Error(`Invalid object ID 0x${hex(idx)}`);
        }
        this.offset   = offset;
        this.dataSize = size;
        this.id       = idx;
        this.data     = objsBin.getData(offset, size);
        const header  = ObjectData.fromBytes(this.data);
        this.header   = header;
        this.index    = null; //from OBJINDEX.bin
        this.dll      = this.game.dlls ? this.game.dlls[this.header.dll_id] : null;

        this.modelIds = [];
        for(let i=0; i<header.nModels; i++) {
            this.modelIds.push(objsBinData.getUint32(
                offset + header.modelList + (i*4)));
        }

        return new Proxy(this, {
            get: function(instance, key) {
                if(key in instance) return instance[key];
                return header[key];
            }
        });
    }
}
