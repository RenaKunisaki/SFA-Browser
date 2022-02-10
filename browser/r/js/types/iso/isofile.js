import Struct from '../../lib/Struct.js';

export default class IsoFile {
    //A file in an ISO.

    constructor(path, isDir=false, offset=0, size=0, buffer=null,
    bufferOffs=0, parent=null, isSystem=false) {
        /** @description Create file in ISO.
         *  @param path       file path within ISO.
         *  @param isDir      whether this represents a directory (true) or file (false).
         *  @param offset     file data offset within ISO.
         *  @param size       file data size in bytes.
         *  @param buffer     buffer to read from.
         *  @param bufferOffs offset to read data from within buffer.
         *  @param parent     parent IsoFile.
         *  @param isSystem   whether this is a system file (extracted to /sys
         *      instead of /files).
         */
        this.path       = path;
        this.isDir      = isDir;
        this.offset     = offset;
        this.size       = size;
        this.buffer     = buffer;
        this.bufferOffs = bufferOffs;
        this.parent     = parent;
        this.isSystem   = isSystem;
        this.name       = path.split('/');
        this.name       = this.name[this.name.length - 1];
    }

    isDescendantOf(file) {
        //Check if this file is a child or descendant of the given file.
        return ((self.parent == file) ||
            (self.parent != null && self.parent.isDescendantOf(file)));
    }
};