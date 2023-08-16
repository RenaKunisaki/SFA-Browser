import { assertType, hex } from "../../Util.js";
import GameFile from "../GameFile.js";
import Game from "../Game.js";
import Map from "./Map.js";
import { BugCheck } from "../../app/errors.js";

/** Represents a pair of files that contain several assets.
 *  This is a base class for various types of archive.
 */
export default class Archive {
    /** Construct Archive.
     *  @param {Game} game The game instance.
     *  @param {string} pathBin The path to the .bin file.
     *  @param {string} pathTab The path to the .tab file.
     */
    constructor(game, pathBin, pathTab) {
        this.game    = assertType(game, Game);
        this.app     = game.app;
        this.pathBin = pathBin;
        this.pathTab = pathTab;
        this.fTab    = new GameFile(this.game.iso.getFile(this.pathTab));
        this.fBin    = new GameFile(this.game.iso.getFile(this.pathBin));
    }

    /** Get an item by its ID.
     *  @param {number} id The ID.
     *  @returns {object} The asset, or null if not present.
     */
    getById(id) {
        throw new BugCheck("Subclass method not implemented");
    }

    /** Get the range of the asset within the bin file.
     *  @param {number} id The ID.
     *  @returns {Array[number]} The asset's offset and size, or null
     *      if not present.
     *  @note For compressed assets, the size is of the compressed data.
     */
    getRegion(id) {
        throw new BugCheck("Subclass method not implemented");
    }
}
