///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
define([
		'dojo/_base/declare',
		'dijit/_WidgetsInTemplateMixin',
		'jimu/BaseWidget',
		'esri/graphic',
		'esri/symbols/SimpleMarkerSymbol',
		'esri/geometry/Polyline',
		'esri/symbols/SimpleLineSymbol',
		'esri/geometry/Polygon',
		'esri/graphicsUtils',
		'esri/symbols/SimpleFillSymbol',
		'esri/symbols/TextSymbol',
		'esri/symbols/Font',
		'esri/units',
		"esri/toolbars/edit",
		'esri/geometry/webMercatorUtils',
		'esri/geometry/geodesicUtils',
		'dojo/_base/lang',
		'dojo/on',
		'dojo/_base/html',
		'dojo/sniff',
		'dojo/_base/Color',
		'dojo/_base/array',
		'dojo/dom-construct',
		'dojo/dom',
		'dijit/form/Select',
		'dijit/form/NumberSpinner',
		'jimu/dijit/ViewStack',
		'jimu/dijit/SymbolChooser',
		'jimu/dijit/DrawBox',
		'jimu/dijit/Message',
		'jimu/utils',
		'jimu/symbolUtils',
		'libs/storejs/store',
		'esri/InfoTemplate',
		'esri/layers/GraphicsLayer'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, Graphic, SimpleMarkerSymbol, Polyline, SimpleLineSymbol, Polygon, graphicsUtils, SimpleFillSymbol,
		TextSymbol, Font, esriUnits, Edit, webMercatorUtils, geodesicUtils, lang, on, html, has,
		Color, array, domConstruct, dom, Select, NumberSpinner, ViewStack, SymbolChooser,
		DrawBox, Message, jimuUtils, jimuSymbolUtils, localStore, InfoTemplate, GraphicsLayer) {

	/*jshint unused: false*/
	return declare([BaseWidget, _WidgetsInTemplateMixin], {
		name : 'eDraw',
		baseClass : 'jimu-widget-edraw',

		//////////////////////////////////////////// GENERAL METHODS //////////////////////////////////////////////////
		/**
		 * Set widget mode :add1 (type choice), add2 (symbology and attributes choice), edit, list, importExport
		 * @param name string Mode
		 *     - add1 : Add drawing (type choice and measure option)
		 *     - add2 : Add drawing (attributes and symbol chooser)
		 *     - edit : Edit drawing (geometry, attributes and symbol chooser)
		 *     - list : List drawings
		 *     - importExport :
		 */
		setMode : function (name) {
			this.editorEnableMapPreview(false);
			this.editorActivateGeometryEdit(false);
			this.allowPopup(false);

			switch (name) {
			case 'add1':
				this.setMenuState('add');

				this._editorConfig["graphicCurrent"] = false;

				this.TabViewStack.switchView(this.addSection);

				this.drawBox.deactivate();

				this.setInfoWindow(false);
				this.allowPopup(false);

				break;
			case 'add2':
				this.setMenuState('add', ['add']);

				this._editorConfig["graphicCurrent"] = false;

				this.editorPrepareForAdd(this._editorConfig["defaultSymbols"][this._editorConfig['commontype']]);

				this.TabViewStack.switchView(this.editorSection);

				this.setInfoWindow(false);

				break;
			case 'edit':
				this.setMenuState('edit', ['edit']);
				if (this._editorConfig["graphicCurrent"]) {
					//prepare editor
					this.editorPrepareForEdit(this._editorConfig["graphicCurrent"]);

					//Focus
					var extent = graphicsUtils.graphicsExtent([this._editorConfig["graphicCurrent"]]);
					this.map.setExtent(extent.expand(2), true);
				}

				this.TabViewStack.switchView(this.editorSection);

				this.setInfoWindow(false);

				break;
			case 'list':
				this.setMenuState('list');
				this.allowPopup(true);

				//Generate list and
				this.listGenerateDrawTable();
				var nb_draws = this.drawBox.drawLayer.graphics.length;
				var display = (nb_draws > 0) ? 'block' : 'none';
				html.setStyle(this.allActionsNode, 'display', display);
				this.tableTH.innerHTML = nb_draws + ' ' + this.nls.draws;

				//Other params
				this._editorConfig["graphicCurrent"] = false;

				this.TabViewStack.switchView(this.listSection);

				break;
			case 'importExport':
				this.setMenuState('importExport');
				this.allowPopup(true);

				//Other params
				this._editorConfig["graphicCurrent"] = false;

				this.TabViewStack.switchView(this.importExportSection);

				this.setInfoWindow(false);

				break;
			}
		},

		showMessage : function (msg, type) {

			var class_icon = "message-info-icon";
			switch (type) {
			case "error":
				class_icon = "message-error-icon";
				break;
			case "warning":
				class_icon = "message-warning-icon";
				break;
			}

			var content = '<i class="' + class_icon + '">&nbsp;</i>' + msg;

			new Message({
				message : content
			});
		},

		setMenuState : function (active, elements_shown) {
			if (!elements_shown) {
				elements_shown = ['add', 'list', 'importExport'];
			} else if (elements_shown.indexOf(active) < 0)
				elements_shown.push(active);

			for (var button_name in this._menuButtons) {
				var menu_class = (button_name == active) ? 'menu-item-active' : 'menu-item';
				if (elements_shown.indexOf(button_name) < 0 || (button_name == "importExport" && !this.config.allowImportExport))
					menu_class = "hidden";
				if (this._menuButtons[button_name])
					this._menuButtons[button_name].className = menu_class;
			}
		},

		setInfoWindow : function (graphic) {
			if (!this.map.infoWindow)
				return false;

			if (!graphic) {
				this.map.infoWindow.hide();
				return true;
			}

			if (graphic.geometry.x)
				var center = graphic.geometry;
			else if (graphic.geometry.getCenter)
				var center = graphic.geometry.getCenter();
			else if (graphic.geometry.getExtent)
				var center = graphic.geometry.getExtent().getCenter();
			else
				return false;

			this.map.infoWindow.setFeatures([graphic]);
			this.map.infoWindow.show(center);

		},

		_clickHandler : false,
		allowPopup : function (bool) {
			this.map.setInfoWindowOnClick(bool);

			if (!bool && this._clickHandler) {
				dojo.disconnect(this._clickHandler);
			} else {
				this._clickHandler = this.drawBox.drawLayer.on("click", this._onDrawClick);
			}
		},

		saveInLocalStorage : function () {
			if (!this.config.allowLocalStorage)
				return;

			localStore.set(this._localStorageKey, this.drawingsGetJson());
		},

		zoomAll : function () {
			var graphics = this.drawBox.drawLayer.graphics;
			var nb_graphics = graphics.length;

			if (nb_graphics < 1)
				return;

			var ext = graphicsUtils.graphicsExtent(this.drawBox.drawLayer.graphics);

			this.map.setExtent(ext, true);
			return true;
		},

		clear : function () {
			if (!this.config.confirmOnDelete || confirm(this.nls.clear)) {
				this.drawBox.drawLayer.clear();
				this.setInfoWindow(false);
				this.setMode("list");
			}
		},

		drawingsGetJson : function (asString) {
			if (this.drawBox.drawLayer.graphics.length < 1)
				return (asString) ? '' : false;

			var content = {
				"features" : [],
				"displayFieldName" : "",
				"fieldAliases" : {},
				"spatialReference" : this.map.spatialReference.toJson(),
				"fields" : []
			};

			for (var i in this.drawBox.drawLayer.graphics)
				content["features"].push(this.drawBox.drawLayer.graphics[i].toJson());

			if (asString) {
				content = JSON.stringify(content);
			}
			return content;
		},

		///////////////////////// MENU METHODS ///////////////////////////////////////////////////////////
		menuOnClickAdd : function () {
			this.setMode("add1");
		},
		menuOnClickList : function () {
			this.setMode("list");
		},
		menuOnClickImportExport : function () {
			this.setMode("importExport");
		},

		onHideCheckboxClick : function () {
			var display = (this.hideCheckbox.checked) ? 'none' : 'block';

			this.drawBox.drawLayer.setVisibility(!this.hideCheckbox.checked);
			this.menu.style.display = display;
			this.settingAllContent.style.display = display;

			if (this.hideCheckbox.checked)
				this.onClose();
			else
				this.onOpen();
		},

		///////////////////////// LIST METHODS ///////////////////////////////////////////////////////////
		listGenerateDrawTable : function () {
			//Generate draw features table
			var graphics = this.drawBox.drawLayer.graphics;
			var nb_graphics = graphics.length;

			//Table
			this.drawsTableBody.innerHTML = "";
			
			var name_max_len = (this.config.listShowUpAndDownButtons) ? 8 : 16;
			
			for (var i = nb_graphics - 1; i >= 0; i--) {
				var graphic = graphics[i];
				var num = i + 1;
				var symbol = graphic.symbol;

				var selected = (this._editorConfig["graphicCurrent"] && this._editorConfig["graphicCurrent"] == graphic);

				if (symbol.type == "textsymbol") {
					var json = symbol.toJson();
					var txt = (json.text.length > 4) ? json.text.substr(0, 4) + "..." : json.text
					var font = (json.font.size < 14) ? 'font-size:' + json.font.size + 'px;' : 'font-size:14px; font-weight:bold;';
					var color = (json.color.length == 4) ? 'rgba(' + json.color.join(",") + ')' : 'rgba(' + json.color.join(",") + ')';
					var symbolHtml = '<span style="color:' + color + ';' + font + '">' + txt + '</span>';
				} else {
					var symbolNode = jimuSymbolUtils.createSymbolNode(symbol, {
							width : 50,
							height : 50
						});
					var symbolHtml = symbolNode.innerHTML;
				}
				var name = (graphic.attributes && graphic.attributes['name']) ? graphic.attributes['name'] : '';
				name = (name.length > name_max_len) ? '<span title="' + name.replace('"', '&#34;') + '">' + name.substr(0, name_max_len) + "...</span>" : name;
				
				var actions = '<span class="edit blue-button" id="draw-action-edit--' + i + '" title="' + this.nls.editLabel + '">&nbsp;</span>'
					+ '<span class="clear red-button" id="draw-action-delete--' + i + '" title="' + this.nls.deleteLabel + '">&nbsp;</span>';
				var actions_class = "list-draw-actions light";
				if(this.config.listShowUpAndDownButtons){
					actions += '<span class="up grey-button" id="draw-action-up--' + i + '" title="' + this.nls.upLabel + '">&nbsp;</span>'
						+ '<span class="down grey-button" id="draw-action-down--' + i + '" title="' + this.nls.downLabel + '">&nbsp;</span>';
					actions_class = "list-draw-actions";
				}
				actions += '<span class="zoom grey-button" id="draw-action-zoom--' + i + '" title="' + this.nls.zoomLabel + '">&nbsp;</span>';
				
				var html = '<td>' + name + '</td>'
					+ '<td class="td-center" id="draw-symbol--' + i + '">' + symbolHtml + '</td>' 
					+ '<td class="' + actions_class + '">' + actions + '</td>';
				var tr = domConstruct.create(
						"tr", {
						id : 'draw-tr--' + i,
						innerHTML : html,
						className : (selected) ? 'selected' : '',
						draggable:"true"
					},
					this.drawsTableBody
				);

				//Bind actions
				on(dom.byId('draw-action-edit--' + i), "click", this.listOnActionClick);
				on(dom.byId('draw-action-delete--' + i), "click", this.listOnActionClick);
				on(dom.byId('draw-action-zoom--' + i), "click", this.listOnActionClick);
				if(this.config.listShowUpAndDownButtons){
					on(dom.byId('draw-action-up--' + i), "click", this.listOnActionClick);
					on(dom.byId('draw-action-down--' + i), "click", this.listOnActionClick);
				}
				
				on(tr, "dragstart", this._listOnDragStart);
			}
			this.saveInLocalStorage();
		},
		
		_listOnDrop:function(evt){
			evt.preventDefault();
			var tr_id = evt.dataTransfer.getData("edraw-list-tr-id");
			
			var target = (evt.target) ? evt.target : evt.originalTarget;
			var target_tr = this._UTIL__getParentByTag(target, "tr");
			
			//If dropped on same tr, exit !
			if(!target_tr || target_tr.id == tr_id){
				return false;
			}
			
			
			//get positions from id
			var from_i = tr_id.split("--")[tr_id.split("--").length - 1];
			var to_i = target_tr.id.split("--")[target_tr.id.split("--").length - 1];
			
			// @TODO Know if drop in top (down target) or bottom (under target)  of row 
			
			//Switch the 2 rows
			this.moveDrawingGraphic(from_i, to_i);
			this.listGenerateDrawTable();
		},
		
		_listOnDragOver:function(evt){
			evt.preventDefault();
		},
		
		_listOnDragStart:function(evt){
			evt.dataTransfer.setData("edraw-list-tr-id", evt.target.id);
		},
		
		switch2DrawingGraphics : function (i1, i2) {
			var g1 = this.drawBox.drawLayer.graphics[i1];
			var g2 = this.drawBox.drawLayer.graphics[i2];

			if (!g1 || !g2)
				return false;

			//Switch graphics
			this.drawBox.drawLayer.graphics[i1] = g2;
			this.drawBox.drawLayer.graphics[i2] = g1;

			//Redraw in good order
			var start_i = (i1 < i2) ? i1 : i2;
			this._redrawGraphics(start_i);
			return true;
		},
		
		moveDrawingGraphic:function(from_i, to_i){
			from_i = parseInt(from_i);
			to_i = parseInt(to_i);
			
			if(from_i == to_i)
				return;
			
			//get from graphic
			var from_graphic = this.drawBox.drawLayer.graphics[from_i];
			
			//Move graphics up or down
			if(from_i < to_i){
				for(var i=from_i, nb=this.drawBox.drawLayer.graphics.length; i < to_i && i < nb; i++)
					this.drawBox.drawLayer.graphics[i] = this.drawBox.drawLayer.graphics[i+1];
			}
			else{
				for(var i=from_i, nb=this.drawBox.drawLayer.graphics.length; i > to_i && i > 0; i--)
					this.drawBox.drawLayer.graphics[i] = this.drawBox.drawLayer.graphics[i-1];
			}
			
			//Copy from graphic in destination
			this.drawBox.drawLayer.graphics[to_i] = from_graphic;
			
			//Redraw in good order
			var start_i = (from_i < to_i) ? from_i : to_i;
			this._redrawGraphics(start_i);
			return true;
		},
		
		_redrawGraphics:function(start_i){
			if(!start_i)
				start_i = 0;
			var nb = this.drawBox.drawLayer.graphics.length;
			for (var i = 0; i < nb; i++) {
				if (i >= start_i) {
					var g = this.drawBox.drawLayer.graphics[i];
					var shape = g.getShape();
					if (shape)
						shape.moveToFront();
				}
			}
			
		},
		listOnActionClick : function (evt) {
			if (!evt.target || !evt.target.id)
				return;

			var tab = evt.target.id.split('--');
			var type = tab[0];
			var i = parseInt(tab[1]);

			var g = this.drawBox.drawLayer.graphics[i];
			this._editorConfig["graphicCurrent"] = g;

			switch (type) {
			case 'draw-action-up':
				this.switch2DrawingGraphics(i, i + 1);
				this.listGenerateDrawTable();
				break;
			case 'draw-action-down':
				this.switch2DrawingGraphics(i, i - 1);
				this.listGenerateDrawTable();
				break;
			case 'draw-action-delete':
				if (!this.config.confirmOnDelete || confirm(this.nls.confirmDrawDelete + ".")) {
					g.getLayer().remove(g);
					this._editorConfig["graphicCurrent"] = false;
					this.listGenerateDrawTable();
				}
				break;
			case 'draw-action-edit':
				this.setMode("edit");
				break;
			case 'draw-action-zoom':
				this.setInfoWindow(g);

				var extent = graphicsUtils.graphicsExtent([g]);
				this.map.setExtent(extent, true);
				this.listGenerateDrawTable();

				break;
			}
		},

		///////////////////////// SYMBOL EDITOR METHODS ///////////////////////////////////////////////////////////
		_editorConfig : {
			drawPlus : {
				"FontFamily" : false,
				"bold" : false,
				"italic" : false,
				"underline" : false,
				"angle" : false,
				"placement" : {
					"vertical" : "middle",
					"horizontal" : "center"
				}
			},
			phantom : {
				"point" : false,
				"symbol" : false,
				"layer" : false,
				"handle" : false
			}
		},

		editorPrepareForAdd : function (symbol) {
			this.editorSymbolChooserConfigure(symbol);

			this.nameField.value = this.nls.nameFieldDefaultValue;
			this.descriptionField.value = '';

			this.editorTitle.innerHTML = this.nls.addDrawTitle;
			this.editorFooterEdit.style.display = 'none';
			this.editorFooterAdd.style.display = 'block';
			this.editorAddMessage.style.display = 'block';
			this.editorEditMessage.style.display = 'none';
			this.editorSnappingMessage.style.display = 'none';

			var commontype = this._editorConfig['commontype'];

			//Mouse preview
			this._editorConfig["phantom"]["symbol"] = symbol;
			this.editorEnableMapPreview((commontype == 'point' || commontype == 'text'));

			//If text prepare symbol
			if (commontype == "text")
				this.editorUpdateTextPlus();

			this.editorActivateSnapping(true);
		},

		editorPrepareForEdit : function (graphic) {
			this.nameField.value = graphic.attributes["name"];
			this.descriptionField.value = graphic.attributes["description"];

			this.editorActivateGeometryEdit(graphic);

			this.editorSymbolChooserConfigure(graphic.symbol);

			this.editorTitle.innerHTML = this.nls.editDrawTitle;
			this.editorFooterEdit.style.display = 'block';
			this.editorFooterAdd.style.display = 'none';
			this.editorAddMessage.style.display = 'none';
			this.editorEditMessage.style.display = 'block';
			this.editorSnappingMessage.style.display = 'block';

			this.editorEnableMapPreview(false);
			this.editorActivateSnapping(true);
		},

		editorSymbolChooserConfigure : function (symbol) {
			if (!symbol)
				return;

			//Set this symbol in symbol chooser
			this.editorSymbolChooser.showBySymbol(symbol);

			var type = symbol.type;
			//Draw plus and specific comportment when text symbol.
			if (type == "textsymbol") {
				//Force editorSymbolChooser _init to walk around jimu.js bug (initTextSection doesn't pass symbol to _initTextSettings)
				this.editorSymbolChooser._initTextSettings(symbol);

				//show draw plus
				this.editorSymbolTextPlusNode.style.display = 'block';

				//Hide text label input (use name instead of)
				var tr = this._UTIL__getParentByTag(this.editorSymbolChooser.inputText, 'tr');
				if (tr)
					tr.style.display = 'none';

				//Draw plus configuration
				this._editorConfig["drawPlus"]["bold"] = (symbol.font.weight == esri.symbol.Font.WEIGHT_BOLD);
				this._editorConfig["drawPlus"]["italic"] = (symbol.font.style == esri.symbol.Font.STYLE_ITALIC);
				this._editorConfig["drawPlus"]["underline"] = (symbol.font.decoration == 'underline');
				this._editorConfig["drawPlus"]["placement"]["horizontal"] = symbol.horizontalAlignment;
				this._editorConfig["drawPlus"]["placement"]["vertical"] = symbol.verticalAlignment;
				this.editorTextPlusFontFamilyNode.set("value", symbol.font.family);
				this.editorTextPlusAngleNode.set("value", symbol.angle);
				this._UTIL__enableClass(this.editorTextPlusBoldNode, 'selected', this._editorConfig["drawPlus"]["bold"]);
				this._UTIL__enableClass(this.editorTextPlusItalicNode, 'selected', this._editorConfig["drawPlus"]["italic"]);
				this._UTIL__enableClass(this.editorTextPlusUnderlineNode, 'selected', this._editorConfig["drawPlus"]["underline"]);
				for (var i in this._editorTextPlusPlacements) {
					var title_tab = this._editorTextPlusPlacements[i].title.split(" ");
					var selected = (title_tab[0] == symbol.verticalAlignment && title_tab[1] == symbol.horizontalAlignment);
					this._UTIL__enableClass(this._editorTextPlusPlacements[i], 'selected', selected);
				}
			} else {
				//Hide draw plus
				this.editorSymbolTextPlusNode.style.display = 'none';
			}
		},

		editorActivateSnapping : function (bool) {
			//If disable
			if (!bool) {
				this.map.disableSnapping();
				return;
			}

			//If enable
			this.map.enableSnapping({
				"layerInfos" : [{
						"layer" : this.drawBox.drawLayer
					}
				],
				"tolerance" : 20
			});
		},

		editorUpdateTextPlus : function () {
			//Only if text
			if (this.editorSymbolChooser.type != "text") {
				return;
			}

			//Get parameters
			var text = this.nameField.value;
			var family = this.editorTextPlusFontFamilyNode.value;
			var angle = this.editorTextPlusAngleNode.value;
			var weight = this._editorConfig["drawPlus"]["bold"] ? esri.symbol.Font.WEIGHT_BOLD : esri.symbol.Font.WEIGHT_NORMAL;
			var style = this._editorConfig["drawPlus"]["italic"] ? esri.symbol.Font.STYLE_ITALIC : esri.symbol.Font.STYLE_NORMAL;
			var decoration = this._editorConfig["drawPlus"]["underline"] ? 'underline' : 'none';
			var horizontal = this._editorConfig["drawPlus"]["placement"]["horizontal"];
			var vertical = this._editorConfig["drawPlus"]["placement"]["vertical"];

			//Prepare symbol
			var symbol = this.editorSymbolChooser.getSymbol();
			this.editorSymbolChooser.inputText.value = text;
			symbol.text = text;
			symbol.font.setFamily(family);
			symbol.setAngle(angle);
			symbol.setHorizontalAlignment(horizontal);
			symbol.setVerticalAlignment(vertical);
			symbol.font.setWeight(weight);
			symbol.font.setStyle(style);
			symbol.font.setDecoration(decoration);

			//Set in symbol chooser
			this.editorSymbolChooser.inputText.value = text;
			this.editorSymbolChooser.showBySymbol(symbol);

			//Update in drawBox
			this.drawBox.setTextSymbol(symbol);

			//Update preview
			this.editorSymbolChooser.textPreview.innerHTML = text;
			this.editorSymbolChooser.textPreview.style.fontFamily = family;
			this.editorSymbolChooser.textPreview.style['font-style'] = (this._editorConfig["drawPlus"]["italic"]) ? 'italic' : 'normal';
			this.editorSymbolChooser.textPreview.style['font-weight'] = (this._editorConfig["drawPlus"]["bold"]) ? 'bold' : 'normal';
			this.editorSymbolChooser.textPreview.style['text-decoration'] = (this._editorConfig["drawPlus"]["underline"]) ? 'underline' : 'none';

			//Update angle preview
			this.editorTextAnglePreviewNode.style.transform = 'rotate(' + angle + 'deg)';
			this.editorTextAnglePreviewNode.style['-ms-transform'] = 'rotate(' + angle + 'deg)';

			//Update symbol on map if on modification
			if (this._editorConfig["graphicCurrent"])
				this._editorConfig["graphicCurrent"].setSymbol(symbol);
			else {
				//Update phantom symbol
				this.editorUpdateMapPreview(symbol);
			}
		},

		editorSetDefaultSymbols : function () {
			var symbol = this.editorSymbolChooser.getSymbol();
			switch (symbol.type.toLowerCase()) {
			case "simplemarkersymbol":
				this.drawBox.setPointSymbol(symbol);
				break;
			case "picturemarkersymbol":
				this.drawBox.setPointSymbol(symbol);
				break;
			case "textsymbol":
				this.drawBox.setPointSymbol(symbol);
				break;
			case "simplelinesymbol":
				this.drawBox.setLineSymbol(symbol);
				break;
			case "cartographiclinesymbol":
				this.drawBox.setLineSymbol(symbol);
				break;
			case "simplefillsymbol":
				this.drawBox.setPolygonSymbol(symbol);
				break;
			case "picturefillsymbol":
				this.drawBox.setPolygonSymbol(symbol);
				break;
			}
		},

		///////////////////////// IMPORT/EXPORT METHODS ///////////////////////////////////////////////////////////
		importFile : function () {
			if (!window.FileReader) {
				this.showMessage(this.nls.importErrorMessageNavigator, 'error');
				return false;
			}

			var input = this.importFileInput.files[0];

			if (!input) {
				this.showMessage(this.nls.importErrorWarningSelectFile, 'warning');
				return false;
			}
			var reader = new FileReader();
			reader.onload = this.importOnFileLoad;
			var txt = reader.readAsText(input);
		},

		importJsonContent : function (json, nameField, descriptionField) {
			try {
				if (typeof json == 'string') {
					json = JSON.parse(json);
				}

				if (!json.features) {
					this.showMessage(this.nls.importErrorFileStructure, 'error');
					return false;
				}

				if (json.features.length < 1) {
					this.showMessage(this.nls.importWarningNoDrawings, 'warning');
					return false;
				}

				if (!nameField) {
					var g = json.features[0];
					var fields_possible = ["name", "title", "label"];
					if (g.attributes) {
						for (var i in fields_possible) {
							if (g.attributes[fields_possible[i]]) {
								nameField = fields_possible[i];
								break;
							}
						}
					}
				}

				for (var i in json.features) {
					var json_feat = json.features[i];

					var g = new Graphic(json_feat);

					if (!g)
						continue;

					if (!g.attributes)
						g.attributes = {};

					g.attributes["name"] = (!nameField || !g.attributes[nameField]) ? 'n°' + (i + 1) : g.attributes[nameField];
					if (g.symbol && g.symbol.type == "textsymbol")
						g.attributes["name"] = g.symbol.text;
					g.attributes["description"] = (!descriptionField || !g.attributes[descriptionField]) ? '' : g.attributes[descriptionField];

					if (g.symbol) {
						this.drawBox.drawLayer.add(g);
					} else {
						var symbol = false;
						switch (g.geometry.type) {
						case 'point':
							var symbol = new SimpleMarkerSymbol();
							break;
						case 'polyline':
							var symbol = new SimpleLineSymbol();
							break;
						case 'polygon':
							var symbol = new SimpleFillSymbol();
							break;
						}
						if (symbol) {
							g.setSymbol(symbol);
							this.drawBox.drawLayer.add(g);
						}
					}
				}

				this.setMode("list");
			} catch (e) {
				this.showMessage(this.nls.importErrorFileStructure, 'error');
				return false;
			}
		},

		importOnFileLoad : function (evt) {
			var content = evt.target.result;
			this.importJsonContent(content);
			this.importFileInput.files[0] = "";
		},

		exportFile : function () {
			// Be sure the link will not open if not asked :
			this.exportButton.href = "#";
			this.exportButton.target = "_self";

			// Control if there are drawings
			if (this.drawBox.drawLayer.graphics.length < 1) {
				this.showMessage(this.nls.importWarningNoExport0Draw, 'warning');
				return false;
			}

			var export_name = (this.config.exportFileName) ? (this.config.exportFileName) : 'myDrawings.json';

			//  Case IE with blob support (IE >= 10) : use MS save blob
			if (window.navigator && window.navigator.msSaveOrOpenBlob) {
				var fileData = [this.drawingsGetJson(true)];
				blobObject = new Blob(fileData, {
						type : 'application/octet-stream'
					});
				window.navigator.msSaveOrOpenBlob(blobObject, export_name);
				return false;
			}

			//  Case IE without blob support : write in tab. Doesn't allways work....
			if (has("ie")) {
				var exportWin = window.top.open("about:blank", "_blank");
				exportWin.document.write(this.drawingsGetJson(true));
				exportWin.document.close();
				exportWin.focus();
				exportWin.document.execCommand('SaveAs', true, export_name);
				exportWin.close();
				return false;
			}

			//  Case HTML5 (Firefox > 25, Chrome > 30....) : use data link with download attribute
			this.exportButton.href = 'data:application/octet-stream;charset=utf-8,' + this.drawingsGetJson(true);
			this.exportButton.target = "_blank";
			this.exportButton.download = export_name;
			return true;
		},

		///////////////////////// EDIT METHODS ///////////////////////////////////////////////////////////
		editorOnClickEditSaveButon : function () {
			if (this.editorSymbolChooser.type == "text") {
				this.editorUpdateTextPlus();
			}

			this._editorConfig["graphicCurrent"].attributes["name"] = this.nameField.value;
			this._editorConfig["graphicCurrent"].attributes["description"] = this.descriptionField.value;

			this.setMode("list");
		},
		editorOnClickEditCancelButon : function () {
			this.editorResetGraphic();
			this.editorActivateGeometryEdit(false);
			this.setMode("list");
		},
		editorOnClickResetCancelButon : function () {
			this.editorResetGraphic();
			this.setMode("edit");
		},

		editorResetGraphic : function () {
			if (this._editorConfig["graphicSaved"] && this._editorConfig["graphicCurrent"]) {
				var g = new Graphic(this._editorConfig["graphicSaved"]);
				this._editorConfig["graphicCurrent"].setGeometry(g.geometry);
				this._editorConfig["graphicCurrent"].setSymbol(g.symbol);
			}
		},

		editorActivateGeometryEdit : function (graphic) {
			if (!graphic)
				this.editorActivateSnapping(false);

			if (!graphic && this._editorConfig["editToolbar"]) {
				this._editorConfig["editToolbar"].deactivate();
				return;
			}

			this._editorConfig["graphicSaved"] = graphic.toJson();

			var tool = 0 | Edit.MOVE;
			if (graphic.geometry.type != "point")
				tool = tool | Edit.EDIT_VERTICES | Edit.SCALE | Edit.ROTATE;

			var options = {
				allowAddVertices : true,
				allowDeleteVertices : true,
				uniformScaling : true
			};
			this._editorConfig["editToolbar"].activate(tool, graphic, options);
		},

		///////////////////////// ADD METHODS ///////////////////////////////////////////////////////////
		drawBoxOnTypeSelected : function (target, geotype, commontype) {
			if (!this._editorConfig["defaultSymbols"])
				this._editorConfig["defaultSymbols"] = {};
			this._editorConfig['commontype'] = commontype;

			var symbol = this._editorConfig["defaultSymbols"][commontype];
			if (!symbol) {
				switch (commontype) {
				case "point":
					symbol = new SimpleMarkerSymbol();
					break;
				case "polyline":
					symbol = new SimpleLineSymbol();
					break;
				case "polygon":
					symbol = new SimpleFillSymbol();
					break;
				case "text":
					symbol = new TextSymbol({
							"verticalAlignment" : "middle",
							"horizontalAlignment" : "center"
						});
					break;
				}
			}

			if (symbol) {
				this._editorConfig["defaultSymbols"][commontype] = symbol;
				this.setMode('add2');
			}
		},

		drawBoxOnDrawEnd : function (graphic, geotype, commontype) {
			var geometry = graphic.geometry;

			this.editorEnableMapPreview(false);

			graphic.attributes = {
				"name" : this.nameField.value,
				"description" : this.descriptionField.value
			}

			if (geometry.type === 'extent') {
				var a = geometry;
				var polygon = new Polygon(a.spatialReference);
				var r = [
					[a.xmin, a.ymin],
					[a.xmin, a.ymax],
					[a.xmax, a.ymax],
					[a.xmax, a.ymin],
					[a.xmin, a.ymin]
				];
				polygon.addRing(r);
				geometry = polygon;

				graphic.setGeometry(polygon);
				var layer = graphic.getLayer();
				layer.remove(graphic);
				layer.add(graphic);

				commontype = 'polygon';
			}
			if (commontype === 'polyline') {
				if (this.showMeasure.checked) {
					this._addLineMeasure(geometry);
				}
			} else if (commontype === 'polygon') {
				if (this.showMeasure.checked) {
					this._addPolygonMeasure(geometry);
				}
			} else if (commontype == 'text' && this.editorSymbolChooser.inputText.value.trim() == "") {
				//Message
				this.showMessage(this.nls.textWarningMessage, 'warning');

				//Remove empty feature (text symbol without text)
				graphic.getLayer().remove(graphic);
			}

			this.saveInLocalStorage();
			this._editorConfig["graphicCurrent"] = graphic;
			this._editorConfig["defaultSymbols"][this._editorConfig['commontype']] = graphic.symbol;
			this.setMode("list");
		},

		editorEnableMapPreview : function (bool) {
			//if deactivate
			if (!bool) {
				//Hide layer
				if (this._editorConfig["phantom"]["layer"])
					this._editorConfig["phantom"]["layer"].setVisibility(false);

				this._editorConfig["phantom"]["symbol"] = false;

				//Remove map handlers
				if (this._editorConfig["phantom"]["handle"]) {
					dojo.disconnect(this._editorConfig["phantom"]["handle"]);
					this._editorConfig["phantom"]["handle"] = false;
				}
				return;
			}

			//Create layer if doesn't exist
			if (!this._editorConfig["phantom"]["layer"]) {
				this._editorConfig["phantom"]["layer"] = new GraphicsLayer({
						id : this.id + "__phantomLayer"
					});
				// this._editorConfig["phantom"]["point"]
				var center = this.map.extent.getCenter();
				this._editorConfig["phantom"]["point"] = new Graphic(center, this._editorConfig["phantom"]["symbol"], {});
				this._editorConfig["phantom"]["layer"].add(this._editorConfig["phantom"]["point"]);
				this._editorConfig["phantom"]["point"].hide();

				this.map.addLayer(this._editorConfig["phantom"]["layer"]);
			} else {
				this._editorConfig["phantom"]["layer"].setVisibility(true);
				this._editorConfig["phantom"]["point"].setSymbol(this._editorConfig["phantom"]["symbol"]);
			}

			//Track mouse on map
			if (!this._editorConfig["phantom"]["handle"]) {
				this._editorConfig["phantom"]["handle"] = on(this.map, 'mouse-move, mouse-out, mouse-over', lang.hitch(this, function (evt) {
							if (this.state === 'opened' || this.state === 'active') {
								switch (evt.type) {
								case 'mousemove':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].setGeometry(evt.mapPoint);
										this._editorConfig["phantom"]["point"].show();
									}
									break;
								case 'mouseout':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].hide();
									}
									break;
								case 'mouseover':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].setGeometry(evt.mapPoint);
										this._editorConfig["phantom"]["point"].show();
									}
									break;
								}
							}
						}));
			}

		},

		editorUpdateMapPreview : function (symbol) {
			if (this.editorSymbolChooser.type != "text" && this.editorSymbolChooser.type != "marker") {
				return;
			}

			if (this._editorConfig["phantom"]["handle"] && this._editorConfig["phantom"]["point"]) {
				this._editorConfig["phantom"]["symbol"] = symbol;
				this._editorConfig["phantom"]["point"].setSymbol(symbol);
			}

		},

		editorOnClickAddCancelButon : function () {
			this.setMode("add1");
		},

		////////////////////////////////////// Measure methods     //////////////////////////////////////////////
		_resetUnitsArrays : function () {
			this.defaultDistanceUnits = [];
			this.defaultAreaUnits = [];
			this.configDistanceUnits = [];
			this.configAreaUnits = [];
			this.distanceUnits = [];
			this.areaUnits = [];
		},

		_getDefaultDistanceUnitInfo : function (unit) {
			for (var i = 0; i < this.defaultDistanceUnits.length; i++) {
				var unitInfo = this.defaultDistanceUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getDefaultAreaUnitInfo : function (unit) {
			for (var i = 0; i < this.defaultAreaUnits.length; i++) {
				var unitInfo = this.defaultAreaUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getDistanceUnitInfo : function (unit) {
			for (var i = 0; i < this.distanceUnits.length; i++) {
				var unitInfo = this.distanceUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getAreaUnitInfo : function (unit) {
			for (var i = 0; i < this.areaUnits.length; i++) {
				var unitInfo = this.areaUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_setMeasureVisibility : function () {
			var display = (this.showMeasure.checked) ? 'block' : 'none';
			html.setStyle(this.areaMeasure, 'display', display);
			html.setStyle(this.distanceMeasure, 'display', display);
		},

		_addLineMeasure : function (geometry) {
			var a = Font.STYLE_ITALIC;
			var b = Font.VARIANT_NORMAL;
			var c = Font.WEIGHT_BOLD;
			var symbolFont = new Font("16px", a, b, c, "Courier");
			var fontColor = new Color([0, 0, 0, 1]);
			var ext = geometry.getExtent();
			var center = ext.getCenter();
			var geoLine = webMercatorUtils.webMercatorToGeographic(geometry);
			var unit = this.distanceUnitSelect.value;
			var lengths = geodesicUtils.geodesicLengths([geoLine], esriUnits[unit]);
			var abbr = this._getDistanceUnitInfo(unit).label;
			var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
			var length = localeLength + " " + abbr;
			var textSymbol = new TextSymbol(length, symbolFont, fontColor);
			var labelGraphic = new Graphic(center, textSymbol, {
					"name" : textSymbol.text,
					"description" : ""
				}, null);
			this.drawBox.drawLayer.add(labelGraphic);
		},

		_addPolygonMeasure : function (geometry) {
			var a = Font.STYLE_ITALIC;
			var b = Font.VARIANT_NORMAL;
			var c = Font.WEIGHT_BOLD;
			var symbolFont = new Font("16px", a, b, c, "Courier");
			var fontColor = new Color([0, 0, 0, 1]);
			var ext = geometry.getExtent();
			var center = ext.getCenter();
			var geoPolygon = webMercatorUtils.webMercatorToGeographic(geometry);
			var areaUnit = this.areaUnitSelect.value;
			var areaAbbr = this._getAreaUnitInfo(areaUnit).label;
			var areas = geodesicUtils.geodesicAreas([geoPolygon], esriUnits[areaUnit]);
			var localeArea = jimuUtils.localizeNumber(areas[0].toFixed(1));
			var area = localeArea + " " + areaAbbr;

			var polyline = new Polyline(geometry.spatialReference);
			var points = geometry.rings[0];
			points = points.slice(0, points.length - 1);
			polyline.addPath(points);
			var geoPolyline = webMercatorUtils.webMercatorToGeographic(polyline);
			var lengthUnit = this.distanceUnitSelect.value;
			var lengthAbbr = this._getDistanceUnitInfo(lengthUnit).label;
			var lengths = geodesicUtils.geodesicLengths([geoPolyline], esriUnits[lengthUnit]);
			var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
			var length = localeLength + " " + lengthAbbr;
			var text = area + "    " + length;

			var textSymbol = new TextSymbol(text, symbolFont, fontColor);
			var labelGraphic = new Graphic(center, textSymbol, {
					"name" : textSymbol.text,
					"description" : ""
				}, null);
			this.drawBox.drawLayer.add(labelGraphic);
		},

		////////    INIT METHODS ////////////////////////////////////////////////////////////////////////////////////////////////////////
		_bindEvents : function () {
			//bind DrawBox
			this.own(on(this.drawBox, 'IconSelected', lang.hitch(this, this.drawBoxOnTypeSelected)));
			this.own(on(this.drawBox, 'DrawEnd', lang.hitch(this, this.drawBoxOnDrawEnd)));

			//Bind symbol chooser change
			this.own(on(this.editorSymbolChooser, 'change', lang.hitch(this, function () {
						this.editorSetDefaultSymbols();

						//If text plus
						if (this.editorSymbolChooser.type == "text") {
							this.editorUpdateTextPlus();
						} else if (this._editorConfig["graphicCurrent"]) {
							//If in modification, update graphic symbology
							this._editorConfig["graphicCurrent"].setSymbol(this.editorSymbolChooser.getSymbol());
						}

						//Phantom for marker
						if (this.editorSymbolChooser.type == "marker")
							this.editorUpdateMapPreview(this.editorSymbolChooser.getSymbol());

					})));

			//bind unit events
			this.own(on(this.showMeasure, 'click', lang.hitch(this, this._setMeasureVisibility)));

			//hitch list event
			this.listOnActionClick = lang.hitch(this, this.listOnActionClick);
			//hitch import file loading
			this.importOnFileLoad = lang.hitch(this, this.importOnFileLoad);

			//Bind draw plus event
			this.editorUpdateTextPlus = lang.hitch(this, this.editorUpdateTextPlus);
			this.editorTextPlusFontFamilyNode.on("change", this.editorUpdateTextPlus);
			this.editorTextPlusAngleNode.on("change", this.editorUpdateTextPlus);
			on(this.editorTextPlusBoldNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["bold"] = !this._editorConfig["drawPlus"]["bold"];
					this._UTIL__enableClass(this.editorTextPlusBoldNode, 'selected', this._editorConfig["drawPlus"]["bold"]);
					this.editorUpdateTextPlus();
				}));
			on(this.editorTextPlusItalicNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["italic"] = !this._editorConfig["drawPlus"]["italic"];
					this._UTIL__enableClass(this.editorTextPlusItalicNode, 'selected', this._editorConfig["drawPlus"]["italic"]);
					this.editorUpdateTextPlus();
				}));
			on(this.editorTextPlusUnderlineNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["underline"] = !this._editorConfig["drawPlus"]["underline"];
					this._UTIL__enableClass(this.editorTextPlusUnderlineNode, 'selected', this._editorConfig["drawPlus"]["underline"]);
					this.editorUpdateTextPlus();
				}));
			this.onEditorTextPlusPlacementClick = lang.hitch(this, function (evt) {
					if (!evt.target)
						return;

					var selected = false;
					for (var i in this._editorTextPlusPlacements) {
						var is_this = (evt.target == this._editorTextPlusPlacements[i]);

						this._UTIL__enableClass(this._editorTextPlusPlacements[i], 'selected', is_this);

						if (is_this)
							selected = this._editorTextPlusPlacements[i];
					}
					if (!selected.title)
						return;
					var tab = selected.title.split(" ");
					this._editorConfig["drawPlus"]["placement"] = {
						"vertical" : tab[0],
						"horizontal" : tab[1]
					}
					this.editorUpdateTextPlus();
				});
			this._editorTextPlusPlacements = [
				this.editorTextPlusPlacementTopLeft,
				this.editorTextPlusPlacementTopCenter,
				this.editorTextPlusPlacementTopRight,
				this.editorTextPlusPlacementMiddleLeft,
				this.editorTextPlusPlacementMiddleCenter,
				this.editorTextPlusPlacementMiddleRight,
				this.editorTextPlusPlacementBottomLeft,
				this.editorTextPlusPlacementBottomCenter,
				this.editorTextPlusPlacementBottomRight
			];
			for (var i in this._editorTextPlusPlacements)
				on(this._editorTextPlusPlacements[i], "click", this.onEditorTextPlusPlacementClick);

		},

		_menuInit : function () {
			this._menuButtons = {
				"add" : this.menuAddButton,
				"edit" : this.menuEditButton,
				"list" : this.menuListButton,
				"importExport" : this.menuListImportExport
			};

			var views = [this.addSection, this.editorSection, this.listSection];

			if (this.config.allowImportExport) {
				views.push(this.importExportSection);
			} else {
				this.menuListImportExport.style.display = 'none';
			}

			this.TabViewStack = new ViewStack({
					viewType : 'dom',
					views : views
				});
			html.place(this.TabViewStack.domNode, this.settingAllContent);
		},

		_initLocalStorage : function () {
			if (!this.config.allowLocalStorage)
				return;

			this._localStorageKey =
				(this.config.localStorageKey) ? 'WebAppBuilder.2D.eDraw.' + this.config.localStorageKey : 'WebAppBuilder.2D.eDraw';

			var content = localStore.get(this._localStorageKey);

			if (!content || !content.features || content.features.length < 1)
				return;

			//Closure with timeout to be sure widget is ready
			(function (widget) {
				setTimeout(
					function () {
					widget.importJsonContent(content, "name", "description");
					widget.showMessage(widget.nls.localLoading);
				}, 200);
			})(this);

		},

		_initDrawingPopupAndClick : function () {
			//Set popup template
			var infoTemplate = new esri.InfoTemplate("${name}", "${description}");
			this.drawBox.drawLayer.setInfoTemplate(infoTemplate);

			//Set draw click
			this._onDrawClick = lang.hitch(this, function (evt) {
					if (!evt.graphic)
						return;

					this._editorConfig["graphicCurrent"] = evt.graphic;
					this.setMode("list");
				});

			//Allow click
			this.allowPopup(true);

		},
		
		_initListDragAndDrop:function(){
			this._listOnDragOver = lang.hitch(this, this._listOnDragOver);
			this._listOnDragStart = lang.hitch(this, this._listOnDragStart);
			this._listOnDrop = lang.hitch(this, this._listOnDrop);
			
			//Bind actions
			on(this.drawsTableBody, "dragover", this._listOnDragOver);
			on(this.drawsTableBody, "drop", this._listOnDrop);
		},

		_initUnitSelect : function () {
			this._initDefaultUnits();
			this._initConfigUnits();
			var a = this.configDistanceUnits;
			var b = this.defaultDistanceUnits;
			this.distanceUnits = a.length > 0 ? a : b;
			var c = this.configAreaUnits;
			var d = this.defaultAreaUnits;
			this.areaUnits = c.length > 0 ? c : d;
			array.forEach(this.distanceUnits, lang.hitch(this, function (unitInfo) {
					var option = {
						value : unitInfo.unit,
						label : unitInfo.label
					};
					this.distanceUnitSelect.addOption(option);
				}));

			array.forEach(this.areaUnits, lang.hitch(this, function (unitInfo) {
					var option = {
						value : unitInfo.unit,
						label : unitInfo.label
					};
					this.areaUnitSelect.addOption(option);
				}));
		},

		_initDefaultUnits : function () {
			this.defaultDistanceUnits = [{
					unit : 'KILOMETERS',
					label : this.nls.kilometers
				}, {
					unit : 'MILES',
					label : this.nls.miles
				}, {
					unit : 'METERS',
					label : this.nls.meters
				}, {
					unit : 'NAUTICAL_MILES',
					label : this.nls.nauticals
				}, {
					unit : 'FEET',
					label : this.nls.feet
				}, {
					unit : 'YARDS',
					label : this.nls.yards
				}
			];

			this.defaultAreaUnits = [{
					unit : 'SQUARE_KILOMETERS',
					label : this.nls.squareKilometers
				}, {
					unit : 'SQUARE_MILES',
					label : this.nls.squareMiles
				}, {
					unit : 'ACRES',
					label : this.nls.acres
				}, {
					unit : 'HECTARES',
					label : this.nls.hectares
				}, {
					unit : 'SQUARE_METERS',
					label : this.nls.squareMeters
				}, {
					unit : 'SQUARE_FEET',
					label : this.nls.squareFeet
				}, {
					unit : 'SQUARE_YARDS',
					label : this.nls.squareYards
				}
			];
		},

		_initConfigUnits : function () {
			array.forEach(this.config.distanceUnits, lang.hitch(this, function (unitInfo) {
					var unit = unitInfo.unit;
					if (esriUnits[unit]) {
						var defaultUnitInfo = this._getDefaultDistanceUnitInfo(unit);
						unitInfo.label = defaultUnitInfo.label;
						this.configDistanceUnits.push(unitInfo);
					}
				}));

			array.forEach(this.config.areaUnits, lang.hitch(this, function (unitInfo) {
					var unit = unitInfo.unit;
					if (esriUnits[unit]) {
						var defaultUnitInfo = this._getDefaultAreaUnitInfo(unit);
						unitInfo.label = defaultUnitInfo.label;
						this.configAreaUnits.push(unitInfo);
					}
				}));
		},

		//////////////////////////// WIDGET CORE METHODS ///////////////////////////////////////////////////////////////////////////////////////

		postMixInProperties : function () {
			this.inherited(arguments);
			this._resetUnitsArrays();
		},

		postCreate : function () {
			this.inherited(arguments);

			//Create symbol chooser
			this.editorSymbolChooser = new SymbolChooser({
					"class" : "full-width",
					"type" : "text",
					"symbol" : new SimpleMarkerSymbol()
				},
					this.editorSymbolChooserDiv);

			this.drawBox.setMap(this.map);

			//Initialize menu
			this._menuInit();

			//Init measure units
			this._initUnitSelect();

			//Bind and hitch events
			this._bindEvents();

			//Prepare text plus
			this._prepareTextPlus();

			//load if drawings in localStorage
			this._initLocalStorage();

			//Popup or click init
			this._initDrawingPopupAndClick();

			//Create edit dijit
			this._editorConfig["editToolbar"] = new Edit(this.map);
			
			//Init list Drag & Drop
			this._initListDragAndDrop();
		},

		_prepareTextPlus : function () {
			//Select central position in UI (text placement)
			this._UTIL__enableClass(this._editorTextPlusPlacements[4], 'selected', true);

			//Manage availaible FontFamily
			if (this.config.drawPlus && this.config.drawPlus.fontFamilies) {
				if (this.config.drawPlus.fontFamilies.length > 0) {
					this.editorTextPlusFontFamilyNode.set("options", this.config.drawPlus.fontFamilies).reset();
				}
			}

		},

		onOpen : function () {
			if (this.drawBox.drawLayer.graphics.length > 0)
				this.setMode("list");
			else
				this.setMode("add1");
		},

		onClose : function () {
			this.editorResetGraphic();
			this.drawBox.deactivate();
			this.setInfoWindow(false);
			this.editorEnableMapPreview(false);
			this.editorActivateGeometryEdit(false);
			this.map.infoWindow.hide();
			this.allowPopup(true);
		},

		destroy : function () {
			if (this.drawBox) {
				this.drawBox.destroy();
				this.drawBox = null;
			}
			if (this.editorSymbolChooser) {
				this.editorSymbolChooser.destroy();
				this.editorSymbolChooser = null;
			}
			this.inherited(arguments);
		},

		///////////////////////// UTILS METHODS ////////////////////////////////////////////////////////////////////////////
		_UTIL__enableClass : function (elt, className, bool) {
			if (elt.classList) {
				if (bool)
					elt.classList.add(className);
				else
					elt.classList.remove(className);
				return;
			}
			elt.className = elt.className.replace(className, "").replace("  ", " ").trim();
			if (bool)
				elt.className += className;
		},

		_UTIL__getParentByTag : function (el, tagName) {
			tagName = tagName.toLowerCase();
			while (el && el.parentNode) {
				el = el.parentNode;
				if (el.tagName && el.tagName.toLowerCase() == tagName) {
					return el;
				}
			}
			return null;
		}

	});
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
});
