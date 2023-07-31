//XXX replace with BinaryFile?
/** Generic data buffer.
 *  Contains binary data which is read sequentially or randomly.
 */
export default class DataBuffer {
    /** Construct DataBuffer.
     *  @param {ArrayBuffer} src ArrayBuffer to wrap.
     *  @param {string} order '>' for big endian or '<' for little endian.
     */
    constructor(src, order='>') {
        this.data   = new DataView(src);
        this.offset = 0;  //current offset to read from
        this.length = this.data.byteLength;
        this.order  = order;
    }

    /** Set read position.
     *  @param {number} offset What to set position to or adjust position by.
     *  @param whence How to adjust position:
     *    0 or 'set': position = offset
     *    1 or 'cur': position += offset
     *    2 or 'end': position = EOF - offset
     *  @returns {number} new offset.
     */
    seek(offset, whence=0) {
        switch(whence) {
            case 0: //SEEK_SET
            case 'set':
                this.offset = offset;
                break;
            case 1: //SEEK_CUR
            case 'cur':
                this.offset += offset;
                break;
            case 2: //SEEK_END
            case 'end':
                this.offset = this.length - offset;
                break;
            default: throw new Error("Invalid `whence` parameter: "+String(whence));
        }
        if(this.offset < 0) this.offset = 0;
        if(this.offset > this.length) this.offset = this.length;
        return this.offset;
    }

    /** Check if read position is at end of stream.
     *  @returns {boolean} true if at end of stream.
     */
    get isEof() {
        return this.offset >= this.length;
    }

    /** Read next byte from data, increment offset,
     *  and return the byte.
     *  @return {number} the byte, or null if at end of data.
     */
    nextS8() {
        if(this.offset >= this.length) return null;
        return this.data.getInt8(this.offset++);
    }
    nextU8() {
        if(this.offset >= this.length) return null;
        return this.data.getUint8(this.offset++);
    }
    nextS16() {
        if(this.offset+1 >= this.length) return null;
        this.offset += 2;
        return this.data.getInt16(this.offset-2, this.order=='<');
    }
    nextU16() {
        if(this.offset+1 >= this.length) return null;
        this.offset += 2;
        return this.data.getUint16(this.offset-2, this.order=='<');
    }
    nextS32() {
        if(this.offset+3 >= this.length) return null;
        this.offset += 4;
        return this.data.getInt32(this.offset-4, this.order=='<');
    }
    nextU32() {
        if(this.offset+3 >= this.length) return null;
        this.offset += 4;
        return this.data.getUint32(this.offset-4, this.order=='<');
    }
    nextS64() {
        if(this.offset+7 >= this.length) return null;
        this.offset += 8;
        return this.data.getBigInt64(this.offset-8, this.order=='<');
    }
    nextU64() {
        if(this.offset+7 >= this.length) return null;
        this.offset += 8;
        return this.data.getBigUint64(this.offset-8, this.order=='<');
    }
    nextFloat() {
        if(this.offset+3 >= this.length) return null;
        this.offset += 4;
        return this.data.getFloat32(this.offset-4, this.order=='<');
    }
    nextDouble() {
        if(this.offset+7 >= this.length) return null;
        this.offset += 8;
        return this.data.getFloat64(this.offset-8, this.order=='<');
    }
}
