import { clearElement, E } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";

export default class TextureViewer {
    /** Widget displaying a map's textures. */
    constructor(mapViewer) {
        this.mapViewer = mapViewer;
        this.game      = mapViewer.game;
        this.app       = mapViewer.game.app;
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
        this.canvas = E.canvas({id:'mapViewTextureCanvas'});
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup',   e => this._onMouseUp  (e));
    }

    _makeControls() {
        this.eTexInfo = E.span('texinfo', "...");
    }

    refresh() {
        if(!this.element.open) return; //don't redraw when hidden

        const map  = this.mapViewer.map;
        const game = this.game;
        const canvas = this.canvas;
        let cw = this._body.clientWidth, ch = this._body.clientHeight;
        const pad = this.padding;
        const lw = 1; //line width for outline

        //build list of textures sorted by height and then by width,
        //to avoid huge gaps in the display.
        //XXX this will include any object textures too once we have those...
        const textures = [];
        for(const [id, tex] of Object.entries(game.loadedTextures)) {
            textures.push({id:id, tex:tex});
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
                item.tex.width+(lw*2), item.tex.height+(lw*2));
            ctx.putImageData(item.tex.image._data, x+lw, y+lw);
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

        clearElement(this.eTexInfo).append(
            `Tex 0x${hex(item.id & 0xFFFF, 4)} size ${item.tex.width}x${item.tex.height}`);
    }

    _onMouseDown(e) {

    }

    _onMouseUp(e) {

    }
}
