import BinaryFile from "../../lib/BinaryFile.js";
import IsoFile from "../../types/iso/isofile.js";
import Text from "./Text.js";
import Phrase from "./Phrase.js";
import { DataError } from "../../app/errors.js";
import { hex } from "../../Util.js";

//struct types
let CharacterStruct, GameTextStruct, TextureStruct;

/** Reads a GameText binary file. */
export default class BinaryReader {

    constructor(app, data) {
        if(data instanceof IsoFile) data = data.getData();
        this.app     = app;
        this.data    = data;
        this._file   = new BinaryFile(this.data);
        CharacterStruct = app.types.getType('sfa.text.CharacterStruct');
        GameTextStruct  = app.types.getType('sfa.text.GameTextStruct');
        TextureStruct   = app.types.getType('sfa.text.TextureStruct');
        this.readCharStructs();
        this.readTexts();
        this.readStringTable();
        this.readUnknown();
        this.readCharTextures();
        this.readStrings();

        //XXX Sequences files have some extra info before the
        //actual strings, such as the sequence ID. Investigate this.
    }

    /** Read the CharacterStructs.
     *  These tell where each character is in the texture,
     *  which texture it's in, and how to align it.
     */
    readCharStructs() {
        const numCharStructs = this._file.readU32();
        //console.log(`numCharStructs = 0x${hex(numCharStructs)}`);
        //sanity check to avoid hanging
        if(numCharStructs > 10000) {
            throw new DataError("Not a GameText file");
        }
        this.charStructs = this._file.read(CharacterStruct, numCharStructs);
        if(numCharStructs == 1) this.charStructs = [this.charStructs];
    }

    /** Read the string offsets.
     *  These are offsets into the actual string data.
     *  The `phrases` field of GameTextStruct is an index
     *  into this list of offsets.
     */
    readStringTable() {
        const numStrs = this._file.readU32();

        //read the offset table
        this.strTab = this._file.readU32(numStrs);
        if(numStrs == 1) this.strTab = [this.strTab];
        this.strDataOffs = this._file.tell();
        //console.log(`numStrs=0x${hex(numStrs)} strDataOffs=0x${hex(this.strDataOffs)}`);

        //skip past the actual strings
        this._file.seek(this.strDataLen, 'SEEK_CUR');
    }

    /** Read some padding data.
     *  This data is always all 0xEE in every file and isn't used.
     */
    readUnknown() {
        const numBytes = this._file.readU32();
        //console.log(`unkDataLen=0x${hex(numBytes)}`);
        //just verify in case it's different in some version...
        //XXX remove this.
        const offs = this._file.tell();
        for(let i=0; i<numBytes; i++) {
            let b = this._file.readU8();
            if(b != 0xEE) {
                console.log(`Suspicious data in gametext file! 0x${hex(b)} @ 0x${hex(this._offset + i + 4)}`);
                break;
            }
        }
        //console.log(`unkData end=0x${hex(offs+numBytes)}`);
        this._file.seek(offs+numBytes);
    }

    /** Read the texture graphics.
     */
    readCharTextures() {
        this.charTextures  = [];
        this.textureOffset = this._file.tell();
        //game will only recognize 2 textures
        while(this.charTextures.length < 2) {
            let start = this._file.tell();
            console.log(`charTextures[${this.charTextures.length}] start=0x${hex(start)}`);
            let texS  = this._file.read(TextureStruct);
            if(texS.width == 0 && texS.height == 0) break;
            let size = texS.width * texS.height;
            if(texS.pixFmt == 4) { size >>= 1; }

            //XXX why multiply by pixFmt!? that can't be right.
            //actually it's copied right from the game...
            console.log(`charTextures[${this.charTextures.length}] size=${texS.width},${texS.height}`);
            this.charTextures.push({
                offset: start,
                texFmt: texS.texFmt,
                pixFmt: texS.pixFmt,
                width:  texS.width,
                height: texS.height,
                data:   this.data.buffer.slice(start, start+size),
                length: ((texS.width * texS.height * texS.pixFmt) >> 4) * 2,
            });
            //XXX make actual images
            this._file.seek(((texS.width * texS.height * texS.pixFmt) >> 4) * 2, 1);
        }
    }

    /** Read the GameText structs.
     *  These tell which strings belong to each text,
     *  how to display it, and which language it is.
     */
    readTexts() {
        const numTexts  = this._file.readU16();
        this.strDataLen = this._file.readU16();
        //console.log(`numTexts=0x${hex(numTexts)} strDataLen=0x${hex(this.strDataLen)}`);
        //here we fill in _textOffsets[] with some empty Text objects plus
        //info about where the strings are and how many.
        //later we'll use that to fill in texts[] with the completed
        //Text objects.
        this._textOffsets = [];
        for(let i=0; i<numTexts; i++) {
            const text = this._file.read(GameTextStruct);
            this._textOffsets.push({
                text: new Text(text.id, [], text.language, text.window,
                    [text.alignH, text.alignV]),
                phraseOffs: text.phrases,
                nPhrases:   text.nPhrases, //offset into strtab -> offset into strdata
            });
        }
    }

    readStrings() {
        //read the actual strings
        //console.log("strTab", this.strTab);
        this.texts = [];
        for(let offs of this._textOffsets) {
            const base = offs.phraseOffs;
            const text = offs.text;
            for(let i=0; i<offs.nPhrases; i++) {
                //console.log(`text 0x${hex(text.id,4)} phrase ${i} base=0x${hex(base)}`);
                console.assert(!isNaN(this.strTab[base+i]));
                this._file.seek(this.strTab[base+i] + this.strDataOffs);
                let phrase = Phrase.fromFile(this._file, text.language);
                text.addPhrase(phrase);
            }
            this.texts.push(text);
        }
    }
}
