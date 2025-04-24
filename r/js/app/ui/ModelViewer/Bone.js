//import { hsv2rgb } from "../../../../Util.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import Box from "../gl/Model/Box.js";

export default class Bone {
    constructor(gx, model, iBone, id) {
        this.gx = gx;
        const bone = model.bones[iBone];
        const xlate = model.xlates[iBone];

        const [head, tail] = model.calcBonePos(bone, true);
        //console.log("Bone", iBone, head, tail);

        this.batch = new RenderBatch(this.gx);
        this.batch.addFunction(
            Box.fromLine(this.gx,
                tail, head, [0.1, 0.1, 0.1]
        ).setId(id).batch);
    }
};
