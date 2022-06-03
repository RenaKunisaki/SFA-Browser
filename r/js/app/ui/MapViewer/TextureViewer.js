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

        //lol
        const canvas = this.canvas;
        const cw = this._body.clientWidth, ch = this._body.clientHeight;
        canvas.setAttribute('width',   cw);
        canvas.setAttribute('height',  ch);
        console.log("set canvas size", cw, ch);

        const map  = this.mapViewer.map;
        const game = this.game;
        const ctx  = canvas.getContext('2d');

        let x=0, y=0, rowH=0;
        const pad = this.padding;
        const lw = 1; //line width
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#FFF';

        for(const [id, tex] of Object.entries(game.loadedTextures)) {
            if(x + tex.width + (lw*2) >= cw) {
                x = 0;
                y += rowH + pad + (lw*2);
                if(y >= ch) break;
                rowH = 0;
            }
            ctx.strokeRect(x, y, tex.width+(lw*2), tex.height+(lw*2));
            ctx.putImageData(tex.image._data, x+lw, y+lw);

            //record position so we can click on the image
            this.texturePositions[id] = {
                x1: x+lw, y1: y+lw,
                x2: x+tex.width+(lw*2), y2: y+tex.height+(lw*2),
            };

            x += tex.width + pad + (lw*2);
            rowH = Math.max(rowH, tex.height);
        }
    }
}
