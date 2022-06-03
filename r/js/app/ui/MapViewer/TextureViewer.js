import { clearElement, E } from "../../../lib/Element.js";

export default class TextureViewer {
    /** Widget displaying a map's textures. */
    constructor(mapViewer) {
        this.mapViewer = mapViewer;
        this.game      = mapViewer.game;
        this.app       = mapViewer.game.app;
        this.canvas    = E.canvas({id:'mapViewTextureCanvas'});
        this._body     = E.div('body',
            E.div('controls',
                //some controls here...
            ), //controls
            this.canvas,
        ); //body
        this.element   = E.details('textures',
            E.summary(null, "Textures"),
            this._body,
        );

        this.padding = 8; //pixels between textures in grid
        this.texturePositions = {};
        this.element.addEventListener('toggle', e => this.refresh());
    }

    refresh() {
        if(!this.element.open) return; //don't redraw when hidden

        const map  = this.mapViewer.map;
        const game = this.game;
        const canvas = this.canvas;
        let cw = this._body.clientWidth, ch = this._body.clientHeight;
        const pad = this.padding;
        const lw = 1; //line width for outline

        //calculate needed size for canvas
        let x=pad, y=pad, rowH=0;
        for(const [id, tex] of Object.entries(game.loadedTextures)) {
            if(x + tex.width + (lw*2) >= cw) {
                x = pad;
                y += rowH + pad + (lw*2);
                rowH = 0;
            }
            //record position so we can click on the image
            this.texturePositions[id] = {
                x1: x+lw, y1: y+lw,
                x2: x+tex.width+(lw*2), y2: y+tex.height+(lw*2),
            };
            x += tex.width + pad + (lw*2);
            rowH = Math.max(rowH, tex.height);
        }

        //set the canvas size
        ch = y + rowH;
        canvas.setAttribute('width',   cw);
        canvas.setAttribute('height',  ch);
        console.log("set canvas size", cw, ch);

        //draw the images
        const ctx  = canvas.getContext('2d');
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#FFF';
        for(const [id, tex] of Object.entries(game.loadedTextures)) {
            let x = this.texturePositions[id].x1;
            let y = this.texturePositions[id].y1;
            ctx.strokeRect(x-1, y-1, tex.width+(lw*2), tex.height+(lw*2));
            ctx.putImageData(tex.image._data, x+lw, y+lw);
        }
    }
}
