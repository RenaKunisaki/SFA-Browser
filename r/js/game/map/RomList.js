import GameFile from "../GameFile.js";
import { assertType } from "../../Util.js";
import Game from "../Game.js";

//struct types
let Vec3f, RomListEntryStruct, RomlistObjLoadFlags;

class RomListEntry {
    /** Construct RomListEntry.
     *  @param {Game} game Game instance this belongs to.
     *  @param {DataView} data Data to construct from.
     *  @param {number} offset Offset to read from.
     *  @param {number} idx Which index in the list this is.
     *    Only used to display in the UI.
     */
    constructor(game, data, offset, idx) {
        this.game       = assertType(game, Game);
        this.app        = game.app;
        this.idx        = idx;

        Vec3f = this.app.types.getType('vec3f');
        RomListEntryStruct = this.app.types.getType('sfa.maps.RomListEntry');
        RomlistObjLoadFlags = this.app.types.getType('sfa.maps.RomlistObjLoadFlags');

        const view      = new DataView(data.buffer);
        const base      = RomListEntryStruct.fromBytes(view, offset);
        console.assert(base.length >= 6);
        this.byteLength = base.length * 4;
        this.defNo      = base.objDef;
        this.acts       = [false]; //act 0 loads no objects
        this.actsMask   = 0;
        this.loadFlags  = base.loadFlags;
        this.bound      = base.bound;
        this.cullDist   = base.cullDist;
        this.position   = base.position;
        this.id         = base.id;
        this.paramData  = new DataView(data.buffer,
            offset+data.byteOffset,
            this.byteLength);
        this.params     = null;

        //set act mask/flags
        for(let i=1; i<16; i++) {
            let disp = 0;
            if(i >= 9) disp = base.acts1 & (1 << (7-(i-9)));
            else disp = base.acts0 & (1 << (i-1));
            this.acts.push(disp == 0); //bit set = do NOT show in this act
            if(!disp) this.actsMask |= (1 << (i-1));
        }

        //set objgroup
        if(this.loadFlags & (RomlistObjLoadFlags.isManualLoad |
            RomlistObjLoadFlags.isLevelObject |
            RomlistObjLoadFlags.isBlockObject)) {
                this.group = -1;
                this.groupMask = 1;
        }
        else {
            this.group = this.bound;
            //bound is probably meant to be interpreted as s8 in
            //this case, since some have it set to 255.
            if(this.group < 0 || this.group >= 32) this.group = -1;
        }
        this.groupMask = 1 << (this.group+1);

        if(this.game.objects) {
            //get the object
            let defNo = this.defNo;
            defNo = (defNo < 0) ? -defNo : this.game.objIndex[defNo];
            this.object = this.game.objects[defNo];
            if(!this.object) this.object = this.game.objects[0];

            //parse the object-specific params
            const dlls = this.game.dlls;
            const dll = dlls ? dlls[this.object.dll_id] : null;
            //console.log("Object", this, "dll", dll);
            if(dll && dll.objParams) {
                this.params  = {};
                const params = dll.readObjParams(this.paramData);
                for(let [name, param] of Object.entries(params)) {
                    this.params[name] = {
                        //XXX this is gross, we end up with param.param
                        //and value.value and both of these are the same.
                        //we should just assign params[name] = param but
                        //we need to fix places that use it.
                        param: param,
                        value: params[name],
                    };
                }
            }
        }
    }
}

/** romlist file, defines objects on a map. */
export default class RomList {
    /** Construct RomList.
     *  @param {Game} game the game this is from.
     *  @param {DataView} view the data to read.
     */
    constructor(game, view) {
        this.game    = assertType(game, Game);
        this.entries = [];
        this.objsByUniqueId = {};
        if(view instanceof GameFile) view = new DataView(view.decompress());
        if(view instanceof ArrayBuffer) view = new DataView(view);
        for(let offs=0; offs<view.byteLength;) {
            let entry = new RomListEntry(this.game, view, offs,
                this.entries.length);
            this.entries.push(entry);
            if(entry.id > 0) {
                if(this.objsByUniqueId[entry.id]) {
                    console.warn("Duplicate object ID", entry, this.objsByUniqueId[entry.id]);
                }
                this.objsByUniqueId[entry.id] = entry;
            }
            offs += entry.byteLength;
        }
    }
}
