import Game from "./Game.js";
import { assertType, getBin } from "../Util.js";
import { Command } from "./text/Command.js";
import { ISO } from "../types/iso/iso.js";
import { TaskCancelled } from "../app/ui/TaskProgress.js";
import TextureArchive from "./map/TextureArchive.js";

/* maybe better way to handle patching is to just iterate all files
 * in the ISO and patch them according to their name/path/format,
 * building the new ISO file by file.
 * that would also simplify adding files, since we can add them
 * into the FST as we go.
 * but maybe this approach doesn't work because we need to generate
 * a .bin and .tab at the same time.
 * we can't guarantee which one we see first when iterating.
 * probably we should treat the ISO as a set of map dirs + misc files/dirs.
 * we can treat all files in the root, and all non-map dirs, as misc.
 *
 * what we should probably do is a hybrid approach: generate updated
 * archives for each map, then iterate the ISO, replacing/patching
 * files as needed including those updated files.
 * also, feels like we should be able to do something like Map.Textures
 * to manage the texture archives...
 */

/** The game patch manager.
 */
export default class Patcher {
    /** Construct Patcher.
     *  @param {Game} game The game instance.
     */
    constructor(game) {
        this.game  = assertType(game, Game);
        this.app   = game.app;
        this.path  = null;
        this.patch = {
            files:  [],
            assets: {
                anim:     {},
                animcurv: {},
                models:   {},
                textures: {},
            },
            gametext: {
                de: {}, //German
                en: {}, //English
                es: {}, //Spanish
                fr: {}, //French
                it: {}, //Italian
                jp: {}, //Japanese
            },
        };
    }

    /** Parse a patch XML file.
     *  @param {string} path The base directory of the XML file.
     *  @param {Element} xml The XML file.
     */
    async loadPatch(path, xml) {
        this.path = path;
        const ePatch = xml.getElementsByTagName('patch')[0];
        for(let elem of ePatch.childNodes) {
            console.log("patch elem", elem);
            switch(elem.tagName) {
                case null: case undefined: break; //skip text nodes
                case 'copy':
                    this.patch.files.push({
                        op:   'copy',
                        from: elem.getAttribute('from'),
                        to:   elem.getAttribute('to'),
                    });
                    break;
                case 'delta':
                    this.patch.files.push({
                        op:    'delta',
                        file:  elem.getAttribute('file'),
                        patch: elem.getAttribute('patch'),
                    });
                    break;
                case 'gametext':
                    this._readGameText(elem);
                    break;
                default:
                    this._readAssetElem(elem);
                    break;
            }
        }
        console.log("Parsed patch", this.patch);
    }

    /** Generate patched ISO file. */
    async generateIso() {
        this.app.progress.show({
            taskText: "Generating ISO",
            stepsDone: 0,
            numSteps: this.game.iso.files.length + 5, //5 system files
        });
        try {
            this._mapDirs = [...new Set(Object.values(this.game.mapDirs))];
            let iso = new ISO(this.app);
            this.iso = iso;
            for(let file of this.game.iso.files) {
                await this.app.progress.update({
                    subText: file.path,
                    addDone: 1,
                });
                await this._copyFile(file);
            }
        }
        catch(ex) {
            if(!(ex instanceof TaskCancelled)) throw ex;
        }
        finally {
            this.app.progress.hide();
        }
    }

    /** Copy this file to the new ISO, applying patches as needed.
     *  @param {IsoFile} file The file.
     */
    async _copyFile(file) {
        switch(file.name) {
            //inconsistent upper/lowercase is correct here
            case 'ANIM.BIN':
            case 'ANIM.TAB':
            case 'ANIMCURV.bin':
            case 'ANIMCURV.tab':
        }
    }

    /** Apply file operations to new ISO. */
    async _doFileOps() {
        for(let fileOp of this.patch.files) {
            switch(fileOp.op) {
                case 'copy': {
                    await this.app.progress.update({
                        subText: `Add: ${fileOp.to}`,
                    });
                    const data = await getBin(`${this.path}/${fileOp.from}`);
                    this.iso.newFile(fileOp.to, data, true);
                    break;
                }
                case 'delta': {
                    await this.app.progress.update({
                        subText: `Patch: ${fileOp.file}`,
                    });
                    //XXX
                    //if we're doing per-file patches do we even
                    //need xdelta? can we not just write a dead
                    //simple format similar to IPS, or implement
                    //UPS or BPS or whatever?
                    break;
                }
                default:
                    console.error("Invalid operation", fileOp);
            }
        }
    }

    /** Download new assets for this patch */
    async _downloadPatchAssets() {
        //XXX add other asset types
        let n=0;
        const count = this.patch.assets.textures.length;
        for(let [_id, patch] of Object.entries(this.patch.assets.textures)) {
            await this.app.progress.update({
                subText: `Download texture: ${patch.src}`,
                stepsDone: n,
                numSteps: count,
            });
            n++;
            patch.data = getBin(`${this.path}/${patch.src}`);
        }
    }

    /** Get the texture archives for this map, as well as the common files.
     *  @param {string} dir The map directory name.
     *  @returns {object} The tables and binaries.
     */
    async _getMapTextureFiles(dir) {
        if(!this.TEXPRETAB) {
                //get common files
            this.TEXTABLE  = this.iso.getFile('/TEXTABLE.bin').getTypedArray(Int16Array);
            this.fTexPbin  = this.iso.getFile('/TEXPRE.bin').getTypedArray(Uint32Array);
            this.fTexPtab  = this.iso.getFile('/TEXPRE.tab');
            this.TEXPRETAB = fTexPtab.getTypedArray(Uint32Array);
        }
        const fTex0bin  = this.iso.getFile(`/${dir}/TEX0.bin`).getTypedArray(Uint32Array);
        const fTex0tab  = this.iso.getFile(`/${dir}/TEX0.tab`).getTypedArray(Uint32Array);
        const fTex1bin  = this.iso.getFile(`/${dir}/TEX1.bin`).getTypedArray(Uint32Array);
        const fTex1tab  = this.iso.getFile(`/${dir}/TEX1.tab`).getTypedArray(Uint32Array);
        return {
            tables: [fTex0tab, fTex1tab, this.TEXPRETAB],
            bins:   [fTex0bin, fTex1bin, this.fTexPbin],
        };
    }

    /** Apply texture replacements. */
    async _doTextures() {
        //process each map
        n = 0;
        for(let [dirId, dir] of Object.entries(this.game.mapDirs)) {
            const files = this._getMapTextureFiles(dir);
            await this.app.progress.update({
                subText: `Update map textures: ${dir}`,
                stepsDone: n,
                numSteps: this._mapDirs.length,
            });

            const additions = [];
            for(let [_id, patch] of Object.entries(this.patch.assets.textures)) {
                //duplicate the game's logic
                let [id, tbl] = this.game.translateTextureId(_id);
                id = files.tables[tbl][id];
                if((id & 0xFF000000) == 0x01000000) {
                    //texture is not present (this entry points to the
                    //placeholder texture)
                    if(!patch.force) continue; //do not add it
                    additions.push({
                        patch: patch,
                        idx:   id,
                        table: tbl,
                    });
                }
                else additions.push({
                    patch: patch,
                    idx:   id,
                    table: tbl,
                });
            }

            if(!additions) continue; //nothing to do for this map
            this._applyTexturePatchesToMap(additions, dirId, files);
        }
    }

    /** Apply the texture changes to this map.
     *  @param {Array} additions The textures to add/replace.
     *  @param {number} dirId The map directory ID.
     *  @param {object} files The table/archive files to use.
     */
    _applyTexturePatchesToMap(additions, dirId, files) {
        //here we need to separate the archives into arrays of
        //binary blobs based on the tables,
        //shove the additions into the arrays at the right spots,
        //replace the elements as needed,
        //pack the arrays back into one big blob, and
        //rebuild the table.
        for(let iTbl=0; iTbl<3; iTbl++) {
            const table   = files.tables[iTbl];
            const bin     = files.bins[iTbl];
            const arc     = new TextureArchive(this.game, dirId, iTbl);
            const regions = arc.getRegions();
            const newData = [];
            const newTab  = [];
            const addIdxs = {};
            for(let add of additions) {
                if(add.tbl == iTbl) addIdxs[add.idx] = add;
            }

            let offset = 0;
            for(let idx=0; idx<regions.length; idx++) {
                const add = addIdxs[idx];
                if(add) {
                    //insert the new data, replacing any that was there.
                    newTab.push((offset >> 1) | ((add.patch.frames + 1) << 24));
                    newData.push(add.patch.data);
                    offset += add.patch.data.byteLength;
                }
                else if(regions[idx]) {
                    //copy the data out of the original file.
                    const bufStart = bin.buffer.byteOffset;
                    const [offs, size] = regions[idx]
                    newData.push(bin.buffer.slice(bufStart+offs,
                        bufStart+offs+size));

                    //copy the frame count from the original table.
                    const frames = (table[idx] >> 24) - 1;
                    newTab.push((offset >> 1) | ((frames + 1) << 24));
                    offset += size;
                }
                else {
                    //1 frame at offset 0 (the placeholder texture)
                    newTab.push(0x01000000);
                }
            }

            //rebuild the table and archive
            const result = this._buildTexTable(blobs);

            //replace files in ISO
            this.iso.newFile(arc.pathBin, result.bin, true);
            this.iso.newFile(arc.pathTab, result.tab, true);
        }
    }

    /** Build a texture offset table and binary archive.
     *  @param {Array} newData The textures themselves as raw binary.
     *  @param {Array} newTab The table entry for each texture.
     *  @returns {object} The TEXn.bin and TEXn.tab file contents.
     *  @note Expects the textures to be padded to a multiple of 32 bytes.
     *     Expects the table to NOT be padded.
     */
    _buildTexTable(newData, newTab) {
        //calculate table length (number of 32-bit words)
        //padding is to 32 bytes, so 8 words
        let len = newTab.length;
        let pad = len & 7;
        if(pad) len += 8 - pad;
        len += 1; //checksum
        pad = len & 7;
        if(pad) len += 8 - pad;

        //create the table
        let newTbl = new Uint32Array(len);
        let idx = 0;
        while(idx < newTab.length) {
            newTbl[idx] = newTab[idx];
            idx++;
        }
        newTbl[idx++] = 0xFFFFFFFF; //end of file
        while(idx & 7) newTbl[idx++] = 0; //padding
        newTbl[idx++] = this._calcTableChecksum(newTbl);
        while(idx & 7) newTbl[idx++] = 0; //padding

        //create the archive
        const arcLen = newData.map(it => it.byteLength).reduce(
            (accum, curVal) => accum + curVal); //get length sum
        const arcBuf = new ArrayBuffer(arcLen);
        const arcArr = new Uint8Array(arcBuf);

        let offset = 0;
        for(let data of newData) { //copy data into archive
            arcArr.set(data, offset);
            offset += data.byteLength;
        }

        return {
            tab: newTbl,
            bin: arcBuf,
        };
    }

    /** Calculate the checksum for a table file.
     *  @param {TypedArray} table The table data.
     *  @returns {number} The checksum.
     *  @note Checksums are ignored by the final game version.
     */
    _calcTableChecksum(table) {
        let result = 0;
        if(table instanceof Uint32Array) {
            for(let entry of table) {
                result  +=  entry >> 24;
                result  += (entry >> 16) & 0xFF;
                result  += (entry >>  8) & 0xFF;
                result  +=  entry        & 0xFF;
            }
        }
        else if(table instanceof Uint16Array) { //XXX do these have checksums?
            for(let entry of table) {
                result  += entry >> 8;
                result  += entry & 0xFF;
            }
        }
        else {
            throw new TypeError(`Unexpected table type: ${table}`);
        }
        return result & 0xFFFFFFFF;
    }

    /** Parse gametext element.
     *  @param {Element} eGametext The XML element.
     */
    _readGameText(eGametext) {
        const lang = eGametext.getAttribute('lang');
        for(let eText of eGametext.childNodes) {
            if(!eText.getAttribute) continue;
            let id = eText.getAttribute('id');
            let text = {
                id: id,
                alignH: eText.getAttribute('alignh'),
                alignV: eText.getAttribute('alignv'),
                window: eText.getAttribute('window'),
                phrases: [],
            };
            this.patch.gametext[lang][id] = text;

            for(let ePhrase of eText.getElementsByTagName('phrase')) {
                text.phrases.push(this._readGameTextPhrase(ePhrase));
            }
        }
    }

    /** Read one gametext phrase.
     *  @param ePhrase The phrase element.
     *  @returns {string} The text string in game format.
     *  @note The returned string is binary and may contain
     *   embedded NULL characters and invalid UTF-8 codes.
     */
    _readGameTextPhrase(ePhrase) {
        let str = "";
        for(let elem of ePhrase.childNodes) {
            if(!elem.getAttribute) continue; //skip whitespace/comments
            if(elem.tagName == 'str') {
                str += elem.textContent;
            }
            else if(Command[elem.tagName]) {
                const cmd = Command[elem.tagName];
                str += String.fromCodePoint(cmd.chr);
                for(let param of cmd.params) {
                    str += String.fromCodePoint(parseInt(elem.getAttribute(param)));
                }
            }
            else {
                console.error("Invalid element in text", elem, ePhrase);
            }
        }
        return str;
    }

    /** Parse asset element.
     *  @param {Element} elem The XML element.
     */
    _readAssetElem(elem) {
        for(let child of elem.childNodes) {
            if(!child.getAttribute) continue;
            let id = parseInt(child.getAttribute('id'));
            let asset = {
                id: id,
                src: child.getAttribute('src'),
                force: child.getAttribute('force') == '1',
            }
            if(elem.tagName == 'texture') {
                asset.frames = parseInt(child.getAttribute('frames'));
            }
            this.patch.assets[elem.tagName][id] = asset;
        }
    }
}
