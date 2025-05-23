import { E } from "./lib/Element.js";

/** Ensure the given object is of one of the given types.
 *  @param obj object to check.
 *  @param types one or more types that obj can be.
 *  @returns obj.
 */
export function assertType(obj, ...types) {
    for(let t of types) {
        if(obj instanceof t) return obj;
    }
    let name = obj.constructor ? obj.constructor.name : (typeof obj);
    throw new TypeError(`Incorrect type for object: ${name}`)
}

/** This function exists solely because the way browsers
 *  handle XML is completely fucking stupid.
 */
export function getAttr(elem, name) {
    let result = elem.getAttribute(name);
    if(result == undefined) result = elem.getAttribute(name.toLowerCase());
    return result;
}

/** Fetch some remote resource.
 *  @param {string} path URI to fetch.
 *  @param {string} mimeType MIME type override to use.
 *  @param {string} responseType 'text' or 'arraybuffer' to override responseType.
 *  @returns a Promise which resolves to the XHR object once the request
 *  is completed, which you can use to retrieve the response in the
 *  desired format.
 */
export function get(params) {
    if(typeof params == 'string') params = {path:params};

    let lolcache = '_='+performance.now();
    if(params.path.indexOf('?') >= 0) lolcache = '&'+lolcache;
    else lolcache='?'+lolcache;

    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        if(params.mimeType != undefined) xhr.overrideMimeType(params.mimeType);
        if(params.responseType != undefined) xhr.responseType = params.responseType;
        xhr.open('GET', params.path+lolcache, true);
        xhr.onreadystatechange = () => {
            if(xhr.readyState == 4) resolve(xhr);
        };
        xhr.onerror = () => {
            reject({
                status:     xhr.status,
                statusText: xhr.statusText
            });
        };
        xhr.send(null);
    });
}

/** Download a binary file.
 *  @param {string} path file path to download.
 *  @returns {ArrayBuffer} file data.
 */
export async function getBin(path) {
    return (await get({
        path:         path,
        mimeType:     'application/octet-stream',
        responseType: 'arraybuffer',
    })).response;
}
/** Download an XML file.
 *  @param {string} path file path to download.
 *  @returns {XMLDocument} file data.
 */
export async function getXml(path) {
    if(!path.startsWith('/')) {
        path = window.location.pathname + path;
    }
    console.log("getXml", path);
    return (await get({
        path:     path,
        mimeType: 'text/xml; charset=utf-8',
    })).responseXML;
}

/** Convert number `n` to hex, padded to given `size`.
 *  @param {number} n number to convert.
 *  @param {number} size minimum number of digits.
 *  @returns {string} hex string.
 *  @note result is uppercase without prefix, eg "0000BABE".
 */
export function hex(n, size=1) {
    if(typeof(n) == 'string') n = parseInt(n);
    if(n == null || n == undefined) return String(n);
    const lol = new Uint32Array(1);
    lol[0] = n; //to handle negatives
    return lol[0].toString(16).toUpperCase().padStart(size, '0');
}
/** Convert number `n` to binary, padded to given `size`.
 *  @param {number} n number to convert.
 *  @param {number} size minimum number of digits.
 *  @returns {string} binary string.
 */
export function bin(n, size=8) {
    if(typeof(n) == 'string') n = parseInt(n);
    if(n == null || n == undefined) return String(n);
    const lol = new Uint32Array(1);
    lol[0] = n; //to handle negatives
    return lol[0].toString(2).padStart(size, '0');
}
/** Convert string `n` to int, returning `dflt` for null/undefined.
 *  @param {string} n string to convert.
 *  @returns {number} integer value, or `dflt`.
 */
export function int(n, dflt=null) {
    if(n == null || n == undefined) return dflt;
    return parseInt(n);
}
/** Convert string `n` to float, returning `dflt` for null/undefined.
 *  @param {string} n string to convert.
 *  @returns {number} float value, or `dflt`.
 */
export function float(n, dflt=null) {
    if(n == null || n == undefined) return dflt;
    return parseFloat(n);
}
/** Convert value (0..1) to percent string.
 *  @param {number} val value to convert.
 *  @returns {string} percent.
 *  @example Percent(0.5) => "50%"
 */
export function Percent(val) {
    return (val * 100).toFixed(0).padStart(3) + '%';
}
/** Convert `val` to human-readable number of bytes.
 *  @param {number} val number of bytes.
 *  @returns {string} human-readable string.
 *  @example fileSize(65536) => "64K"
 */
export function fileSize(val) {
    if(val == undefined || val == null) return val;
    const units = [' ', 'K', 'M', 'G', 'T'];
    let unit = 0;
    while(unit < units.length && val > 9999) {
        val = Math.floor(val / 1024);
        unit++;
    }
    return `${val.toString().padStart(4)}${units[unit]}`;
}

/** Convert Hue, Saturation, Value to RGB.
 *  @param {number} h hue, in degrees (0..360)
 *  @param {number} s saturation (0..1)
 *  @param {number} v value (0..1)
 *  @returns {array} [r, g, b] (0..1)
 *  @note copied from https://en.wikipedia.org/wiki/HSL_and_HSV
 */
export function hsv2rgb(h, s, v) {
    const c = v * s; //chroma
    h = h / 60; //convert degrees
    const x = c * (1 - Math.abs(h % 2 - 1));
    let r=0, g=0, b=0;
    if     (0 <= h && h <= 1) { r=c; g=x; b=0; }
    else if(1 <= h && h <= 2) { r=x; g=c; b=0; }
    else if(2 <= h && h <= 3) { r=0; g=c; b=x; }
    else if(3 <= h && h <= 4) { r=0; g=x; b=c; }
    else if(3 <= h && h <= 4) { r=0; g=x; b=c; }
    else if(4 <= h && h <= 5) { r=x; g=0; b=c; }
    else if(5 <= h && h <= 6) { r=c; g=0; b=x; }
    const m = v - c
    return [r+m, g+m, b+m];
}

/** Convert RGB to Hue, Saturation, Value.
 *  @param {number} r red value (0..1)
 *  @param {number} g green value (0..1)
 *  @param {number} b blue value (0..1)
 *  @returns {array} [h, s, v] (0..1)
 *  @note copied from https://en.wikipedia.org/wiki/HSL_and_HSV
 */
export function rgb2hsv(r, g, b) {
    let xMax = Math.max(r, g, b);
    let xMin = Math.min(r, g, b);
    let v    = xMax;
    let c    = xMax - xMin;
    let s    = (v == 0) ? 0 : (c/v);
    let h;
    if(c == 0) h = 0;
    else if(v == r) h =      (g-b)/c;
    else if(v == g) h = 2 + ((b-r)/c);
    else if(v == b) h = 4 + ((r-g)/c);
    return [h, s, v];
}

/** Create the tr and td elements of a table from some arrays.
 *  @param {array} rows arrays of cell contents.
 *  @returns {array} array of HTML `tr` elements.
 */
export function Table(...rows) {
    let elems = [];
    for(let row of rows) {
        let tr = E.tr(null);
        for(let cell of row) tr.append(E.td(null, cell));
        elems.push(tr);
    }
    return elems;
}

/** Given some strings or HTML elements, return a list.
 *  @param {array} items items to list.
 *  @returns list element.
 *  @note If there is more than one item, the list is a
 *  collapsible element (<summary> and <details> elements).
 *  If one item, the list is a <span>. If zero,
 *  the list is an empty string.
 */
export function CollapseList(...items) {
    if(items.length == 0) return '';
    if(items.length == 1) return E.span('list', items[0]);
    const eList = E.ul();
    const elem = E.details('collapseList', E.summary(null,
        E.span('count', items.length), items[0]), eList);
    for(let i=1; i<items.length; i++) {
        eList.append(E.li(null, items[i]));
    }
    return elem;
}

/** Given a string containing XML, return a beautified version.
 *  @param {string} sourceXml the XML to format.
 *  @returns {string} the formatted XML.
 *  @note Adapted from https://stackoverflow.com/a/47317538
 */
export function prettyXml(sourceXml) {
    //TODO figure out how to get <foo /> instead of <foo></foo>
    const xmlDoc  = new DOMParser().parseFromString(sourceXml, 'application/xml');
    const xsltDoc = new DOMParser().parseFromString([
        // describes how we want to modify the XML - indent everything
        '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
        '  <xsl:strip-space elements="*"/>',
        '  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
        '    <xsl:value-of select="normalize-space(.)"/>',
        '  </xsl:template>',
        '  <xsl:template match="node()|@*">',
        '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
        '  </xsl:template>',
        '  <xsl:output indent="yes"/>',
        '</xsl:stylesheet>',
    ].join('\n'), 'application/xml');

    const xsltProcessor = new XSLTProcessor();
    xsltProcessor.importStylesheet(xsltDoc);
    const resultDoc = xsltProcessor.transformToDocument(xmlDoc);
    return new XMLSerializer().serializeToString(resultDoc);
};

/** Prompt the user to download the file whose content
 *  is stored in `data`, with default name `name` and
 *  MIME type `type`.
 *  @param data data to download.
 *  @param {string} name default file name.
 *  @param {string} type MIME type.
 */
export function download(data, name, type='') {
    //not async because we don't wait for the download; we just
    //simulate clicking a link. the user might get a "save file"
    //prompt and be able to cancel, or it might just go to
    //Downloads folder automatically, depending on their settings.
    const file = new Blob([data], {type: type});
    const a = E.a({href: URL.createObjectURL(file)});
    a.download = name;
    a.click();
}

/** Prompt the user to download an XML file.
 *  @param {XMLDocument} xml data to download.
 *  @param {string} name default file name.
 *  @param {string} type MIME type.
 */
export function downloadXml(xml, name, type='application/xml', pretty=false) {
    if(name.indexOf('.') < 0) name += '.xml';
    let data = new XMLSerializer().serializeToString(xml);
    if(pretty) data = prettyXml(data);
    download(data, name, type);
}

/** Create hex dump of data.
 *  @param {ArrayBuffer} data data to dump.
 *  @param {int} offset First byte to dump.
 *  @param {int} length Number of bytes to dump. Default: to end of data.
 *  @param {int} cols Number of columns.
 *  @returns an array of lines.
 */
export function hexdump(data, offset=0, length=null, cols=16) {
    let view = data;
    if(view instanceof DataView) view = view.buffer;
    view = new Uint8Array(view);
    const res  = [];
    if(length == null) length = view.byteLength;
    for(let offs=offset; offs<length; offs += cols) {
        const line = [offs.toString(16).padStart(4, '0').toUpperCase()+' '];
        for(let col=0; col<cols && col+offs < length; col++) {
            const b = view[offs+col].toString(16).padStart(2, '0').toUpperCase();
            line.push(b+' ');
            if((col & 3) == 3) line.push(' ');
        }
        res.push(line.join(''));
    }
    return res; //.join('\n');
}

export function isPowerOf2(value) {
    return (value & (value - 1)) == 0;
}

export function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
}
