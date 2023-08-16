import { assertType, hex } from "../../Util.js";
import GameFile from "../GameFile.js";
import Game from "../Game.js";
import Map from "./Map.js";
import SfaTexture from '../SfaTexture.js';
import Texture from '../../app/ui/gl/Texture.js'
import Archive from "./Archive.js";

/** Represents one texture archive.
 *  Each map has two archives, plus TEXPRE.
 */
export default class TextureArchive extends Archive {
    /** Construct Archive.
     *  @param {Game} game The game instance.
     *  @param {number} idMap The map ID (ignored for TEXPRE).
     *  @param {number} idTbl The table index (0=TEX0, 1=TEX1, 2=TEXPRE).
     */
    constructor(game, idMap, idTbl) {
        this.idTbl = idTbl;
        if(this.idTbl == 2) {
            this.idMap  = null;
            this.dirMap = 'animtest'; //provide a valid dir
            super(game, '/TEXPRE.bin', '/TEXPRE.tab');
        }
        else {
            this.idMap  = idMap;
            this.dirMap = game.getMapDirName(idMap);
            super(game,
                `${this.dirMap}/TEX${this.idTbl}.bin`,
                `${this.dirMap}/TEX${this.idTbl}.tab`);
        }
    }

    /** Get a texture by its ID.
     *  @param {number} id The ID.
     *  @returns {SfaTexture} The texture, or null if not present.
     */
    getById(id) {
        const origId = id;
        let [newId, tblIdx] = this.game.translateTextureId(id);
        id = newId;
        if(tblIdx != this.idTbl) return null; //not present here
        return this.game.loadTexture(id, this.dirMap);
    }

    /** Get the range of the texture within the bin file.
     *  @param {number} id The ID.
     *  @param {boolean} translate Whether to translate the ID. If false,
     *      treat it as an index into the file. Used internally.
     *  @returns {Array[number]} The textures's offset and size, or null
     *      if not present.
     *  @note This region includes the frame offsets and compressed images.
     */
    getRegion(id, translate=true) {
        //const origId = id;
        if(translate) {
            let [newId, tblIdx] = this.game.translateTextureId(id);
            id = newId;
            if(tblIdx != this.idTbl) return null; //not present here
        }

        this.fTab.seek(id*4);
        let texOffs = fTab.readU32();
        //technically every archive contains an entry for every ID,
        //with "not present" IDs mapping to a placeholder.
        //we do want to be able to access that placeholder, but not
        //extract it multiple times.
        if(texOffs == 0x01000000 && id != 0) return null;

        let size;
        const offset  = (texOffs & 0xFFFFFF) * 2;
        const nFrames = (texOffs >> 24) & 0x3F;
        if(nFrames == 1) { //only one image
            this.fBin.seek(offset + 0xC);
            size = this.fBin.readU32() + 16; //ZLB compressed size + header
        }
        else { //list of offsets followed by compressed images
            //they're in order, so get the last one.
            this.fBin.seek(offset+(nFrames+1));
            const offsLast = this.fBin.readU32() + offset;
            this.fBin.seek(offsLast+0xC);
            size = (offsLast - offset) + this.fBin.readU32() + 16;
        }
        return [offset, size];
    }

    /** Get the region of every texture in the archive.
     *  @returns {Array} List of index => region for all entries.
     *  @note The returned indices are not texture IDs.
     */
    getRegions() {
        let result = [];
        let idx = 0;
        while(true) {
            this.fTab.seek(idx*4);
            let texOffs = fTab.readU32();
            if(texOffs == 0xFFFFFFFF) break;
            result.push(this.getRegion(idx, false));
            idx++;
        }
        return result;
    }
}
