/** A file in an ISO.
 */
export default class IsoFile {
    /** Create file in ISO.
     *  @param {string} path file path within ISO.
     *  @param {boolean} isDir whether this represents a directory (true) or file (false).
     *  @param {number} offset file data offset within ISO.
     *  @param {number} size file data size in bytes.
     *  @param {ArrayBufferLike} buffer buffer to read from.
     *  @param {number} bufferOffs offset to read data from within buffer.
     *  @param {IsoFile} parent parent IsoFile.
     *  @param {boolean} isSystem whether this is a system file (extracted to /sys
     *      instead of /files).
     */
    constructor(path, isDir=false, offset=0, size=0, buffer=null,
    bufferOffs=0, parent=null, isSystem=false) {
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
        this._data      = {}; //cache
    }

    /** Check if this file is a child or descendant of the given file.
     *  @param {IsoFile} file The file to check.
     *  @returns {boolean} True if this file is a descendant of the given file.
     */
    isDescendantOf(file) {
        return ((self.parent == file) ||
            (self.parent != null && self.parent.isDescendantOf(file)));
    }

    /** Get the format of this file.
     *  @param {number} offset The offset to read from, for archives.
     *  @returns {string} The format.
     */
    getFormat(offset=0) {
        let view = new DataView(this.buffer, this.bufferOffs+offset, 4);
        const magic = view.getUint32(0, false);
        switch(magic) {
            case 0x5A4C4200: return "ZLB"; //'ZLB\0'
            default: return "raw";
        }
    }

    /** Get a view of this file's data.
     *  @param {number} offset The offset to start at.
     *  @param {number} size The length of the view. If <= 0, add the file's size
     *      minus the offset.
     *  @returns {DataView} The view.
     */
    getData(offset=0, size=0) {
        if(size <= 0) size += this.size;

        let key = `R${offset},${size}`;
        if(!this._data[key]) {
            this._data[key] = new DataView(this.buffer,
                this.bufferOffs+offset, size);
        }
        return this._data[key];
    }

    /** Get a TypedArray for this file's data.
     *  @param {function} typ The constructor to use. Should be
     *    a subclass of TypedArray.
     *  @returns {TypedArray} The array.
     */
    getTypedArray(typ) {
        return new typ(this.buffer, this.bufferOffs, this.size);
    }
};
