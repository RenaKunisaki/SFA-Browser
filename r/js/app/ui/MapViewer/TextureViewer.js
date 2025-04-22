import { clearElement, E } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";
import { ImageFormatNames } from "../../../lib/Texture/types.js";
import SfaTexture from '../../../game/SfaTexture.js';
import Texture from '../gl/Texture.js';

let _nextId=0;

/** Widget displaying a map/model's textures. */
export default class TextureViewer {
    constructor(viewer) {
        this.viewer   = viewer;
        this.game     = viewer.game;
        this.app      = viewer.game.app;
        this.textures = {};
        this._makeCanvas();
        this._makeControls();
        this._body     = E.div('body',
            E.div('controls',
                this.eTexInfo,
            ), //controls
            E.div('canvaswrap', this.canvas),
        ); //body
        this.element   = E.details('textures',
            E.summary(null, "Textures"),
            this._body,
        );

        this.padding = 8; //pixels between textures in grid
        this.texturePositions = {};
        this.element.addEventListener('toggle', e => this.refresh());
    }

    _makeCanvas() {
        this.canvasId = `mapViewTextureCanvas${_nextId++}`;
        this.canvas = E.canvas({id:this.canvasId});
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup',   e => this._onMouseUp  (e));
    }

    _makeControls() {
        this.eTexInfo = E.span('texinfo', "...");
    }

    /** Set the list of textures to show.
     *  @param {object} textures Dict of ID => Texture.
     */
    setTextures(textures) {
        this.textures = {};
        for(let [id, tex] of Object.entries(textures)) {
            if(tex instanceof Texture) tex = tex.gameTexture;
            this.textures[id] = tex;
        }
    }

    refresh() {
        if(!this.element.open) return; //don't redraw when hidden
        this.texturePositions = {};

        const game = this.game;
        const canvas = this.canvas;
        let cw = this._body.clientWidth, ch = this._body.clientHeight;
        const pad = this.padding;
        const lw = 1; //line width for outline

        //build list of textures sorted by height and then by width,
        //to avoid huge gaps in the display.
        console.log("textures", this.textures);
        const textures = [];
        for(const [id, tex] of Object.entries(this.textures)) {
            if(tex) {
                textures.push({id:id, tex:tex});
            }
        }
        textures.sort((a,b) => {
            return ((a.tex.height*10000)+a.tex.width) -
                ((b.tex.height*10000)+b.tex.width);
        });

        //calculate needed size for canvas
        let x=pad, y=pad, rowH=0;
        for(const item of textures) {
            if(x + item.tex.width + (lw*2) >= cw) {
                x = pad;
                y += rowH + pad + (lw*2);
                rowH = 0;
            }
            //record position so we can click on the image
            this.texturePositions[item.id] = {
                id: item.id, tex: item.tex,
                x1: x+lw, y1: y+lw,
                x2: x+item.tex.width+(lw*2), y2: y+item.tex.height+(lw*2),
            };
            x += item.tex.width + pad + (lw*2);
            rowH = Math.max(rowH, item.tex.height);
        }

        //set the canvas size
        ch = y + rowH + pad;
        canvas.setAttribute('width',   cw);
        canvas.setAttribute('height',  ch);
        console.log("set canvas size", cw, ch);

        //draw the images
        const ctx  = canvas.getContext('2d');
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#FFF';
        for(const item of textures) {
            let x = this.texturePositions[item.id].x1;
            let y = this.texturePositions[item.id].y1;
            ctx.strokeRect(x-1, y-1,
                item.tex.width+(lw*2)+2, item.tex.height+(lw*2)+2);
            if(item.tex.image) {
                ctx.putImageData(item.tex.image._data, x+lw, y+lw);
            }
        }
    }

    _getTextureAt(x, y) {
        for(const [id, item] of Object.entries(this.texturePositions)) {
            if(x >= item.x1 && x <= item.x2 && y >= item.y1 && y <= item.y2) {
                return item;
            }
        }
    }

    _onMouseMove(e) {
        const item = this._getTextureAt(e.offsetX, e.offsetY);
        if(!item) return;

        const T = item.tex;
        let fmt = T.format;
        if(ImageFormatNames[fmt]) fmt = ImageFormatNames[fmt];
        else fmt = `unk${hex(fmt,2)}`;

        //XXX who's changing the ID such that we need to do this?
        let id = T.id;
        if(id < 0) id = (-id) & 0x7FFF;
        else if(id >= 0x8000) id &= 0x7FFF;

        clearElement(this.eTexInfo).append(
            `Tex 0x${hex(item.id & 0xFFFF, 4)}: `+
            `${T.width}x${T.height}, ${fmt}, ${T.numMipMaps} mips; `+
            `ID=0x${hex(id)} offs=0x${hex(T.offset)} T${T.tblIdx}`);

    }

    _onMouseDown(e) {

    }

    _onMouseUp(e) {

    }
}
