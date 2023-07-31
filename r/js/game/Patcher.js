import Game from "./Game.js";
import { assertType, getBin } from "../Util.js";
import { Command } from "./text/Command.js";
import { ISO } from "../types/iso/iso.js";
import { TaskCancelled } from "../app/ui/TaskProgress.js";

/* maybe better way to handle patching is to just iterate all files
 * in the ISO and patch them according to their name/path/format,
 * building the new ISO file by file.
 * that would also simplify adding files, since we can add them
 * into the FST as we go.
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
        });
        try {
            this._mapDirs = [...new Set(Object.values(this.game.mapDirs))];
            let iso = new ISO(this.app);
            this.iso = iso;
            for(let file of this.game.iso.files) {
                await this.app.progress.update({
                    subText: `Add: ${fileOp.to}`,
                });
            }
        }
        catch(ex) {
            if(!(ex instanceof TaskCancelled)) throw ex;
        }
        finally {
            this.app.progress.hide();
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
                    break;
                }
                default:
                    console.error("Invalid operation", fileOp);
            }
        }
    }

    /** Apply texture replacements. */
    async _doTextures() {
        //get common files
        this.TEXTABLE = this.iso.getFile('/TEXTABLE.bin').getTypedArray(Int16Array);
        const fTexPbin = this.iso.getFile('/TEXPRE.bin').getTypedArray(Uint32Array);
        const fTexPtab = this.iso.getFile('/TEXPRE.tab');
        const TEXPRETAB = fTexPtab.getTypedArray(Uint32Array);

        //download the replacements
        let n=0;
        const count = this.patch.assets.textures.length;
        for(let [_id, patch] of Object.entries(this.patch.assets.textures)) {
            await this.app.progress.update({
                subText: `Download texture: ${patch.src}`,
                stepsDone: n,
                numSteps: count,
            });
            n++;
            patch.data = await getBin(`${this.path}/${patch.src}`);
        }

        //process each map
        n = 0;
        for(let dir of this._mapDirs) {
            await this.app.progress.update({
                subText: `Update map textures: ${dir}`,
                stepsDone: n,
                numSteps: this._mapDirs.length,
            });
            const fTex0bin  = this.iso.getFile(`/${dir}/TEX0.bin`).getTypedArray(Uint32Array);
            const fTex0tab  = this.iso.getFile(`/${dir}/TEX0.tab`).getTypedArray(Uint32Array);
            const fTex1bin  = this.iso.getFile(`/${dir}/TEX1.bin`).getTypedArray(Uint32Array);
            const fTex1tab  = this.iso.getFile(`/${dir}/TEX1.tab`).getTypedArray(Uint32Array);
            const tables    = [fTex0tab, fTex1tab, TEXPRETAB];
            const additions = [];
            for(let [_id, patch] of Object.entries(this.patch.assets.textures)) {
                //duplicate the game's logic
                let [id, tbl] = this._translateTextureId(_id);
                id = tables[tbl][id];
                if((id & 0xFF000000) == 0x01000000) {
                    //texture is not present
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
            this._applyTexturePatchesToMap(additions, {
                tables: tables,
                bins:   [fTex0bin, fTex1bin, fTexPbin],
            });
        }
    }

    /** Translate texture ID the way the game does.
     *  @param {number} id The texture ID.
     *  @returns {Array[number]} The table index and which table.
     */
    _translateTextureId(id) {
        let tbl;
        const origId = id;
        if(id < 0) id = -id;
        else id = this.TEXTABLE[id];
        if(origId < 3000 || id == 0) id += 1;
        if(id & 0x8000) {
            id &= 0x7FFF;
            tbl = 1; //TEX1
        }
        else if(id >= 3000) {
            //you'd expect id -= 3000 here, but nope
            tbl = 2; //TEXPRE
        }
        else tbl = 0; //TEX0
        return [id, tbl];
    }

    /** Apply the texture changes to this map.
     *  @param {Array} additions The textures to add/replace.
     *  @param {object} files The table/archive files to use.
     */
    _applyTexturePatchesToMap(additions, files) {
        //here we need to separate the archives into arrays of
        //binary blobs based on the tables,
        //shove the additions into the arrays at the right spots,
        //replace the elements as needed,
        //pack the arrays back into one big blob, and
        //rebuild the table.
        for(let iTbl=0; iTbl<3; iTbl++) {
            let table   = files.tables[iTbl];
            let archive = files.bins[iTbl];
            const blobs = this._splitTextureFile(table, archive);
            //for textures, it shouldn't matter what order they're in...
            for(let add of additions) {
                if(add.tbl != iTbl) continue;
                blobs[add.idx].data   = add.patch.data;
                blobs[add.idx].length = add.patch.data.byteLength;
                blobs[add.idx].count  = add.patch.frames;
            }

            //rebuild the table and archive
            const result = this._buildTexTable(blobs);

            //XXX replace the files in the ISO with result.bin and result.tab
        }
    }

    /** Split a texture file into individual binary blobs.
     *  @param {Uint32Array} table The table file data.
     *  @param {Uint32Array} archive The binary file.
     *  @returns {Array} A list of each entry's offset and length
     *      within the binary, its flags, and the number of frames.
     */
    _splitTextureFile(table, archive) {
        let blobs = [];
        for(let iEntry=0; iEntry<table.length; iEntry++) {
            let offset = table[iEntry];
            if(offset == 0xFFFFFFFF) break;
            const blob = {
                offset: (offset & 0xFFFFFF) * 2,
                flags:  (offset >> 30),
                count:  (offset >> 24) & 0x3F,
                length: 0,
                data:   null,
            };
            blobs.append(blob);
            if(!blob.flags) continue; //texture isn't present
            if(blob.count == 1) {
                //at this offset is one ZLB archive
                blob.length = archive[(blob.offset >> 2)+3];
            }
            else {
                //at this offset is (count+1) u32 values
                //each value (plus this offset) is the offset of
                //one ZLB archive.
                //they're in order, so get the last one.
                const offs = (blob.offset >> 2);
                let last = archive[offs+(blob.count-1)];
                blob.length = (count*4) + archive[(offs+(last>>2))+3];
            }
            blob.data = archive.buffer.slice(
                blob.offset + archive.offset,
                blob.offset + archive.offset + blob.length,
            );
        }
        return blobs;
    }

    /** Build a texture offset table and binary archive.
     *  @param {Array} blobs The texture binary blobs.
     *  @returns {object} The TEXn.bin and TEXn.tab file contents.
     *  @note Expects the blobs to be padded to a multiple of 32 bytes.
     */
    _buildTexTable(blobs) {
        //calculate table length (number of 32-bit words)
        //padding is to 32 bytes, so 8 words
        let len = blobs.length;
        let pad = len & 7;
        if(pad) len += 8 - pad;
        len += 1; //checksum
        pad = len & 7;
        if(pad) len += 8 - pad;
        let newTbl = new Uint32Array(len);
        let offset = 0;
        let cksum  = 0;
        let idx    = 0;
        for(let blob of blobs) {
            let entry = 0x01000000;
            if(blob.length > 0) {
                entry = (blob.count << 24) | 0x80000000 | (offset >> 2);
            }
            newTbl[idx++] = entry;
            blob.offset = offset;
            offset += blob.length;
            cksum  +=  entry >> 24;
            cksum  += (entry >> 16) & 0xFF;
            cksum  += (entry >>  8) & 0xFF;
            cksum  +=  entry        & 0xFF;
        }
        newTbl[idx++] = 0xFFFFFFFF; //end of file
        while(idx & 7) newTbl[idx++] = 0; //padding
        newTbl[idx++] = (cksum & 0xFFFFFFFF);
        while(idx & 7) newTbl[idx++] = 0; //padding

        //create the archive
        let bin = new Uint8Array(offset);
        for(let blob of blobs) {
            if(blob.data != null) {
                bin.set(blob.data, blob.offset);
            }
        }

        return {
            tab: newTbl,
            bin: bin,
        };
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
