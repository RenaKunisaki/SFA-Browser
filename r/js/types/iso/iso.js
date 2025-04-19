import DOL from './dol.js';
import { FST } from './fst.js';
import { hex } from '../../Util.js';
import IsoFile from './isofile.js';

//boot.bin, bi2.bin, appldr, fst, main.dol, files

export const DVD_MAGIC = 0xC2339F3D;
export const BOOT_BIN_SIZE = 0x440;

//struct types
let Appldr, Bi2Bin, BootBin;

export class ISO {
    constructor(app) {
        this.app          = app;
        this.bootBin      = null;
        this.bi2bin       = null;
        this.appldr       = null;
        this.fstbin       = null;
        this.debugMonitor = null;
        this.mainDol      = null;
        this.files        = [];
        this._buffer      = null; //for copying

        Appldr  = this.app.types.getType('iso.Appldr');
        Bi2Bin  = this.app.types.getType('iso.Bi2Bin');
        BootBin = this.app.types.getType('iso.BootBin');
    }

    /** Read entire ISO file from buffer.
     */
    readBuffer(buffer, offset=0) {
        if(buffer.buffer) {
            //if given a typed array, get the underlying buffer.
            offset += buffer.byteOffset;
            buffer  = buffer.buffer;
        }
        console.log("Buffer is", buffer);
        this._buffer = buffer;
        const view = new DataView(buffer);

        console.log(`Read boot.bin from 0x${hex(offset)}`);
        this.bootBin = BootBin.fromBytes(view, offset);
        console.log("boot.bin", this.bootBin);
        if(this.bootBin.magic != DVD_MAGIC) {
            console.error(`Invalid DVD_MAGIC ${hex(this.bootBin.magic)}, expected ${hex(DVD_MAGIC)}`);
            throw new Error("Not a GameCube ISO file");
        }
        offset += BootBin.size;

        console.log("Game code:", this.bootBin.gameCode);
        console.log("Company code:", this.bootBin.company);
        console.log("Disc #:", this.bootBin.discNo);
        console.log("Version:", this.bootBin.version);
        console.log("Streaming:", this.bootBin.audioStreaming,
            this.bootBin.streamBufSize);
        console.log("Title:", this.bootBin.gameName);
        console.log("Debug Monitor:", hex(this.bootBin.debugMonitorOffs),
            hex(this.bootBin.debugMonitorAddr));
        console.log("main.dol:", hex(this.bootBin.mainDolOffs));
        console.log("FST: offset", hex(this.bootBin.fstOffs),
            "size", hex(this.bootBin.fstSize),
            "max", hex(this.bootBin.maxFstSize),
            "addr", hex(this.bootBin.fstAddr));
        console.log("Files:", hex(this.bootBin.fileOffset),
            hex(this.bootBin.fileLength));

        console.log(`Read bi2.bin  from 0x${hex(offset)}`);
        this.bi2bin = Bi2Bin.fromBytes(view, offset);
        offset += Bi2Bin.size;

        console.log(`Read appldr   from 0x${hex(offset)}`);
        this.appldr = Appldr.fromBytes(view, offset);
        offset += Appldr.size;

        console.log(`Read fst.bin  from 0x${hex(this.bootBin.fstOffs)}`);
        this.fstbin = new FST(this.app).read(buffer, this.bootBin.fstOffs);

        //size is found by adding up the sections, so not known here.
        //not sure how it gets loaded, probably appldr just loads a fixed size.
        console.log(`Read main.dol from 0x${hex(this.bootBin.mainDolOffs)}`);
        this.mainDol = new DOL("main.dol", this.bootBin.mainDolOffs, 0,
            buffer, true);

        //XXX debug monitor?

        console.log(`Read files    from 0x${hex(this.bootBin.mainDolOffs+this.mainDol.size)}`);
        this.files = this.fstbin.files;

        return this;
    }

    /** Retrieve file from ISO. */
    getFile(path) {
        for(const file of this.files) {
            if(file.path == path) return file;
        }
        return null;
    }

    /** Add a file.
     *  @param {string} path The path.
     *  @param {ArrayBufferLike} data The contents.
     *  @param {boolean} replace Whether to replace any existing file.
     *  @returns {IsoFile} The new file.
     */
    newFile(path, data, replace=false) {
        let old = this.getFile(path);
        if(old) {
            if(replace) {
                let idx = this.files.indexOf(old);
                this.files.splice(idx, 1); //remove this entry
            }
            else {
                throw new Error(`File already exists: "${path}"`);
            }
        }
        let splitPath = path.split('/');
        const name = splitPath.pop();
        const parent = this.getFile(splitPath.join('/'));
        if(!parent) {
            throw new Error(`Directory not found for file "${path}"`);
        }
        const file = new IsoFile(path, false, 0, data.byteLength,
            data, 0, parent, false);
        this.files.push(file);
        return file;
    }

    /** Build a new ISO.
     *  @returns {ISO} The new ISO.
     *  @note For performance, adding/replacing/removing files does not
     *    change the underlying buffer, so those changes won't be
     *    reflected when reading it back. Use this method to construct
     *    a new buffer containing the updated files.
     */
    build() {
        //huge buffer to hold an entire GC ISO
        const buffer = new ArrayBuffer(1.5 * 1024 * 1024 * 1024);
        const result = new ISO(this.app);
        result._buffer = buffer;
        let offset = 0;

        const align = (amount) => {
            const cnt = offset % amount;
            if(cnt) offset += cnt;
        };
        const write = (data) => {
            buffer.set(data, offset);
            offset += data.byteLength;
        };

        //build FST
        this.files.sort(file => {
            file.path.toLowerCase().replaceAll('/', '\x01')
        });
        const fst = new FST(this.app);

        //right now, boot.bin and fst.bin contain outdated
        //offsets, but we'll fix that later.

        write(this.bootBin);
        write(this.bi2bin);
        write(this.appldr);
        align(2048);
        write(this.mainDol);
        align(256); //XXX fishy
        write(fst);
        align(0x8000);

        //write files
        for(let iFile=0; iFile<this.files.length; iFile++) {
            const file = this.files[iFile];
            const newFile = new IsoFile(file.path, file.isDir,
                offset, file.size, buffer, offset, file.parent,
                file.isSystem);
            //XXX will need to correct newFile.parent to reference
            //the same file in this ISO instead of the original ISO
            write(file.getData());

            //stream files must be aligned to 32K.
            //may as well pad everything to 32K.
            //it's a little wasteful, but the ISOs are usually heavily
            //padded anyway.
            align(32768);
        }


        //now go back and update the FST
        //now that we know the file offsets.

        //and update the file offset in boot.bin
        //now that we know what it is.

        return result;
    }
}
