import { clearElement, E } from "../../../lib/Element.js";

export default class LayerChooser {
    /** Widget that lets you choose what to display. */
    constructor(mapViewer) {
        this._nextId   = 0;
        this.mapViewer = mapViewer;
        this.game      = mapViewer.game;
        this.app       = mapViewer.game.app;

        this.eLayers = E.details('map-layers', {open:'open'},
            E.summary(null, "Layers"));
        this.eObjs = E.details('map-objects', {open:'open'},
            E.summary(null, "Objects"));
        this.eHits = E.details('map-hits', {open:'open'},
            E.summary(null, "Collision"));
        this.eDebug = E.details('map-debug',
            E.summary(null, "Debug"));

        this.element = E.div('map-layer-chooser', this.eLayers, this.eObjs,
            this.eHits, this.eDebug);

        this.layers      = {};
        this.layers      = {};
        this._layerOrder = [];
        this._addLayer(this.eLayers, 'boolean', 'mainGeometry',
            "Main Geometry", true, "Non-translucent, non-reflective polygons");
        this._addLayer(this.eLayers, 'boolean', 'waterGeometry',
            "Water Geometry", true, "Translucent, reflective polygons");
        //XXX this should be renamed
        this._addLayer(this.eLayers, 'boolean', 'reflectiveGeometry',
            "Translucent Geometry", true, "Translucent, non-reflective polygons");
        this._addLayer(this.eLayers, 'boolean', 'hiddenGeometry',
            "Hidden Geometry", false, "Polygons normally not visible");
        this._addLayer(this.eLayers, 'boolean', 'blockBounds', "Block Bounds",
            false, "Map block boundary boxes");
        this._addLayer(this.eLayers, 'boolean', 'warps', "Warps", false,
            "WARPTAB entries");

        this._addLayer(this.eHits, 'boolean', 'hitPolys', "Hit Polys", false,
            "Hit detect mesh");
        this._addLayer(this.eHits, 'boolean', 'polyGroups', "Poly Groups",
            false, "Polygon group boxes");
        this._addLayer(this.eHits, 'boolean', 'blockHits', "Block Hits", false,
            "Data from HITS.bin");

        this._addLayer(this.eObjs, 'list', 'actNo', "Objects",
            0, "Which act to show objects for");
        this._addLayer(this.eObjs, 'boolean', 'triggers', "Triggers",
            false, "Invisible control objects");
        this._addLayer(this.eObjs, 'boolean', 'curves', "Curves",
            false, "Invisible control objects");


        //debug
        this.eWhichList = E.input(null, {type:'number', value:-1});
        this.eWhichList.addEventListener('change', e => this.mapViewer.redraw());
        this.eDebug.append(E.div('debug',
            E.span('label', "Dlist:"), this.eWhichList,
        ));
    }

    _addLayer(parent, type, name, displayName, value=undefined, tooltip='') {
        const layer = {
            name:        name,
            displayName: displayName,
            tooltip:     tooltip,
            type:        type,
            value:       value,
        };
        this.layers[name] = layer;
        this._layerOrder.push(name);

        const id = `mapview-layers-${name}`;
        switch(type) {
            case 'boolean': {
                const eBox = E.input(null, {type:'checkbox', id:id});
                const eLbl = E.label(null, {'for':id}, displayName);
                const eDiv = E.div('checkbox', eBox, eLbl);
                if(value) eBox.checked = true;
                eBox.addEventListener('change', e => this.toggleLayer(name));
                layer.element = eDiv;
                layer.checkbox = eBox;
                break;
            }

            case 'list': {
                const elem = E.select({id:id});
                layer.element = E.div('list',
                    E.label(null, {'for':id}, displayName),
                    elem);
                layer.list = elem;
                elem.addEventListener('change',
                    e => this.setLayer(name, elem.value));
                break;
            }
        }

        const elem = layer.element;
        if(elem) {
            if(tooltip != null) elem.setAttribute('title', tooltip);
            parent.append(elem);
        }
        else console.warn("No element created for layer", layer);
    }

    toggleLayer(name) {
        const layer = this.layers[name];
        switch(layer.type) {
            case 'boolean':
                this.setLayer(name, !layer.value);
                break;
        }
    }

    setLayer(name, value) {
        const layer = this.layers[name];
        layer.value = value;
        switch(layer.type) {
            case 'boolean':
                layer.checkbox.checked = value;
                break;
        }
        this.mapViewer.redraw();
    }

    getLayer(name) {
        return this.layers[name].value;
    }

    _updateActList() {
        const objCounts = []; //act# => obj count
        for(let i=0; i<16; i++) objCounts.push(0);
        let objs = this.mapViewer.map.romList;
        if(objs) objs = objs.entries;
        if(!objs) objs = [];
        for(let obj of objs) {
            for(let i=1; i<16; i++) {
                if(obj.acts[i]) objCounts[i]++;
            }
        }
        const lAct   = this.layers['actNo'];
        const oldAct = lAct.value;
        clearElement(lAct.list);
        lAct.list.append(E.option(null, "None", {value:0}));
        for(let i=1; i<16; i++) {
            lAct.list.append(E.option(null,
                `Act ${i} (${objCounts[i]})`, {value:i}));
        }
        lAct.list.append(E.option(null,
            `All Acts (${objs.length})`, {value:-1}));
        lAct.list.value = oldAct;
    }

    refresh() {
        if(!this.mapViewer.map) return;
        this._updateActList();
    }
}
