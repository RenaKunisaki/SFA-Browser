import { assertType } from "../../Util.js";
import Game, { MAP_CELL_SIZE } from "../Game.js";
import Block from "./Block.js";
import GameFile from "../GameFile.js";

/** A map in the game.
 *  @note Map IDs can be confusing because the game refers to them by
 *   different IDs in different contexts:
 *   - id: index into MAPINFO.bin
 *   - dirId: index into directory name list in DOL
 *   Also, there are some files left on the disc from deleted maps;
 *   we assign these negative IDs if they don't have an ID defined.
 *   Also, not all maps have all information; for example, there are
 *   several entries in MAPINFO.bin that have a corresponding romlist
 *   file but no asset directory.
 */
export default class Map {

    /** The Game instance.
     *  @type {Game}
     */
    game;

    /** The map's ID.
     *  @type {number}
     */
    id;

    /** The index into the map directory list.
     *  @type {number}
     */
    dirId;

    /** The name of the map's asset directory.
     *  @type {string}
     */
    dirName; //XXX should be automatic from dirId

    /** The name of the romlist file, found in the disc root.
     *  @type {string}
     */
    romListName;

    /** The number of bytes allocated for the romlist data.
     *  @type {number}
     */
    romListSize;

    /** The romlist instance.
     *  @type {RomList}
     */
    romList;

    /** The internal name from MAPINFO.bin.
     *  @type {string}
     */
    name;

    /** The map type ID from MAPINFO.bin.
     *  @type {number}
     */
    type;

    /** The map's parent ID.
     *  @type {number}
     */
    parentId;

    /** The linked map IDs.
     *  @type {Array[number]}
     */
    links;

    /** The player object type ID.
     *  @type {number}
     *  @note Not used in final version of the game, but still present.
     */
    objType;

    /** The X coordinate on the global map grid, in global grid coordinates.
     *  @type {number}
     */
    worldX;

    /** The Z coordinate on the global map grid, in global grid coordinates.
     *  @type {number}
     */
    worldZ;

    /** Which global map grid this map is on.
     *  @type {number}
     */
    layer;

    /** The map's X size, in blocks.
     *  @type {number}
     */
    sizeX;

    /** The map's Z size, in blocks.
     *  @type {number}
     */
    sizeZ;

    /** The X coordinate of the origin block, relative to top left of map.
     *  @type {number}
     */
    originX;

    /** The Z coordinate of the origin block, relative to top left of map.
     *  @type {number}
     */
    originZ;

    /** The map's blocks.
     *  @type {Array[Block]}
     */
    blocks;

    /** Unknown value from MAPS.bin first struct.
     *  @type {number}
     */
    unk08;

    /** Unknown value from MAPS.bin first struct.
     *  @type {number}
     */
    unk0C;

    /** Unknown value from MAPS.bin first struct.
     *  @type {number}
     */
    unk1D;

    /** Unknown value from MAPS.bin first struct.
     *  @type {number}
     */
    unk1E;

    //following are added manually, not present in the game data

    /** Brief description of which map this is.
     *  @type {string}
     */
    description;

    /** Whether this map is used in the game.
     *  @type {boolean}
     */
    isUsed;

    constructor(game, params={}) {
        this.game        = assertType(game, Game);
        this.id          = params.id;
        this.dirId       = params.dirId;
        this.dirName     = params.dirName;
        this.romListName = params.romListName;
        this.romListSize = params.romListSize;
        this.romList     = params.romList;
        this.name        = params.name;
        this.type        = params.type;
        this.parentId    = params.parentId;
        this.links       = params.links;
        this.objType     = params.objType;
        this.worldX      = params.worldX;
        this.worldZ      = params.worldZ;
        this.layer       = params.layer;
        this.sizeX       = params.sizeX;
        this.sizeZ       = params.sizeZ;
        this.originX     = params.originX;
        this.originZ     = params.originZ;
        this.blocks      = params.blocks;
        this.unk08       = params.unk08;
        this.unk0C       = params.unk0C;
        this.unk1D       = params.unk1D;
        this.unk1E       = params.unk1E;
        this.description = params.description;
        this.isUsed      = params.isUsed;

        //these are only populated when needed
        this.textures    = null;
        this._modelIds   = null;
    }

    /** The global coordinates of this map's origin block.
     *  @type {Array[number]}
     */
    get worldOrigin() {
        return [
            (this.worldX - this.originX) * MAP_CELL_SIZE,
            (this.worldZ - this.originZ) * MAP_CELL_SIZE,
        ];
    }

    /** Get the block at this location.
     *  @param {number} x The X grid coordinate relative to top left.
     *  @param {number} z The Z grid coordinate relative to top left.
     *  @returns {?Block} The block, or null if no block is here.
     */
    getBlock(x, z) {
        if(this.blocks == undefined) return null;
        let idx = (z * this.sizeX) + x;
        return this.blocks[idx];
    }

    /** Append a block to this map's list.
     *  @param {Block} block The block.
     *  @note Intended to be used during parsing.
     */
    addBlock(block) { //XXX rename
        assertType(block, Block);
        if(this.blocks == undefined) this.blocks = [];
        this.blocks.push(block);
    }

    /** Check if this map has any asset files.
     *  @returns {bool} true if the map has asset files.
     *  @note Used to filter empty/missing map directories
     *   from the model viewer.
     */
    hasAssets() {
        //any asset file will do
        const mTab = this.game.iso.getFile(`/${this.dirName}/MODELS.tab`);
        return mTab ? true : false;
    }

    /** Get the list of model IDs present in this map.
     * @returns List of model IDs found in this map.
     */
    getModels() {
        if(this._modelIds != null) return this._modelIds;
        const dir = this.dirName;

        //MODELIND is apparently not reliable?
        //the game seems to bypass it for objects
        /*let mInd = this.iso.getFile(`${dir}/MODELIND.bin`);
        if(!mInd) {
            console.error("Model files not found in", dir);
            return null;
        }
        mInd = new GameFile(mInd);

        const modelIds = [];
        mInd.seek(0);
        for(let i=0; i<mInd.byteLength/2; i++) {
            const idx = mInd.readU16(); //get index of this model ID
            if(idx != 0) {
                modelIds.push(i);
            }
        }*/

        this._modelIds = [];
        let mTab = this.game.iso.getFile(`/${dir}/MODELS.tab`);
        if(!mTab) {
            console.error("Model files not found in", dir);
            return this._modelIds;
        }
        mTab = new GameFile(mTab);
        mTab.seek(0);
        for(let i=0; i<mTab.byteLength/4; i++) {
            const idx = mTab.readU32();
            if(idx == 0xFFFFFFFF) break; //end of file
            if((idx & 0xFF000000) != 0) { //valid entry
                this._modelIds.push(i);
            }
        }
        console.log(`Found ${this._modelIds.length} models in ${dir}`);
        return this._modelIds;
    }
}
