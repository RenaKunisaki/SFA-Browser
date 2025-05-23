import { clearElement, E } from "../../../lib/Element.js";

/** Widget that lets you choose what to display. */
export default class LayerChooser {
    constructor(modelViewer) {
        this.modelViewer = modelViewer;
        this.game        = modelViewer.game;
        this.app         = modelViewer.game.app;

        this.checkboxes = {};
        this.labels = {};

        this._addLayer('geometry', "Geometry").checked = true;
        this._addLayer('origin', "Origin");
        this._addLayer('bones', "Bones");
        this._addLayer('bonesFront', "Bones in Front");

        this.element = E.div('model-layer-chooser',
            E.div(null,
                this.checkboxes.geometry, this.labels.geometry,
                this.checkboxes.origin, this.labels.origin),
            E.div(null,
                this.checkboxes.bones, this.labels.bones,
                this.checkboxes.bonesFront, this.labels.bonesFront,
            ),
        );
    }

    _addLayer(id, name) {
        const check = E.input(null, {
            type:'checkbox', id:`chkModelViewLayer_${id}`});
        check.addEventListener('change', e => {
            this.modelViewer.redraw();
        });
        const lbl = E.label(null,
            {'for':`chkModelViewLayer_${id}`}, name);

        //this.element.append(check);
        //this.element.append(lbl);
        this.checkboxes[id] = check;
        this.labels[id] = lbl;

        return check;
    }

    isLayerEnabled(id) {
        return this.checkboxes[id].checked;
    }

    setNumBones(num) {
        this.labels.bones.innerText = `Bones (${num})`;
    }
}
