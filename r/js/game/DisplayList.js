import { assertType, hexdump } from "../Util.js";
import Game from "./Game.js";

let DisplayListPtr = null;

/** Display list pointed to by DisplayListPtr */
export default class DisplayList {
    /** Construct DisplayList.
     *  @param {Game} game The game this belongs to.
     *  @param {DataView} view The view to read from.
     *  @param {int} offset Offset to read the DisplayListPtr from.
     */
    constructor(game, view, offset) {
        assertType(game, Game);
        assertType(view, DataView);
        this.game = game;
        if(!DisplayListPtr) DisplayListPtr =
            game.app.types.getType('sfa.maps.DisplayListPtr');

        const ptr = DisplayListPtr.fromBytes(view, offset);
        this.ptr  = ptr; //debug
        this.bbox = ptr.bbox;
        this.shaderId = ptr.shaderId;
        this.specialBitAddr = ptr.specialBitAddr;
        this.unk12 = ptr._12;
        this.unk16 = ptr._16;
        this.unk18 = ptr._18;
        this.data  = view.buffer.slice(view.byteOffset+ptr.list,
            view.byteOffset+ptr.list+ptr.size);
        //console.log("Dlist:", hexdump(this.data));
    }
}
