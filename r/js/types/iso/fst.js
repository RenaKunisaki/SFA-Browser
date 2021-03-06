import IsoFile from './isofile.js';

//ISO directory structure
let FstEntry;

export class FST {
    constructor(app) {
        this.app       = app;
        this.files     = [];
        this._entries  = [];
        this._strTable = [];

        FstEntry = this.app.types.getType('iso.FstEntry');
    }

    read(buffer, offset=0) {
        const view = new DataView(buffer);
        let   root = this._readEntry(view, offset);
        if(!root.isDir) {
            throw new Error("ISO root directory is not a directory");
        }
        this._entries.push(root);
        root.path = '/';

        const nFiles = root.nextIdx;
        const strTabOffs = (nFiles * 0xC) + offset;
        offset += FstEntry.size;

        //read _entries
        for(let i=0; i<nFiles-1; i++) {
            this._entries.push(this._readEntry(view, offset));
            offset += FstEntry.size;
        }

        //read names
        for(let i=0; i<this._entries.length; i++) {
            const entry = this._entries[i];
            let name = this._readString(view, strTabOffs + entry.nameOffs);
            //XXX name should be encoded to bytes and have null terminator,
            //if we even use this.
            this._strTable.push(name);
            entry.name = name;
        }

        //read directory structure
        this._readFstDir(0, '');

        //convert to IsoFile
        for(const entry of this._entries) {
            let f;
            let parent = entry.parent;
            if(parent != null) parent = this.files[parent.idx];
            if(entry.isDir) {
                f = new IsoFile(entry.path, true, 0, 0, null, 0, parent);
            }
            else {
                f = new IsoFile(entry.path, false, entry.fileOffs,
                    entry.fileSize, buffer, entry.fileOffs, parent);
            }
            f.idx = entry.idx;
            this.files.push(f);
        }

        return this;
    }

    _readFstDir(idx, path, _depth=0) {
        if(_depth >= 10) {
            throw new Error("Maximum depth exceeded");
        }
        const entry = this._entries[idx];
        idx++;
        while(idx < entry.nextIdx && idx < this._entries.length) {
            const f  = this._entries[idx];
            f.path   = `${path}/${f.name}`;
            f.parent = entry;
            if(f.isDir) idx = this._readFstDir(idx, f.path, _depth+1);
            else idx++;
        }
        return idx;
    }

    _readString(view, offset, maxLen=1000000) {
        let res = '';
        while(res.length < maxLen) {
            let n = view.getUint8(offset++);
            if(n == 0) break;
            res += String.fromCharCode(n);
        }
        return res;
    }

    _readEntry(view, offset) {
        const data = FstEntry.fromBytes(view, offset);
        const type = (data.nameOffs >> 24) & 0xFF;
        if(type > 1) throw new Error("Corrupted FST");
        //console.log("FST entry", this._entries.length, "@", hex(offset),
        //    "nameOffs", hex(data.nameOffs & 0xFFFFFF), "type", type,
        //    "offset", hex(data.fileOffs), "size", hex(data.size));

        const entry = {
            nameOffs: data.nameOffs & 0xFFFFFF,
            isDir:    type != 0,
            idx:      this._entries.length,
            parent:   null,
        };
        if(entry.isDir) {
            entry.parentIdx = data.fileOffs; //parent directory idx
            entry.nextIdx   = data.size; //next idx which is NOT in this dir
        }
        else {
            entry.fileOffs  = data.fileOffs;
            entry.fileSize  = data.size;
        }
        return entry;
    }
};
