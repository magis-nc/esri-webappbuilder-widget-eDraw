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
    'esri/geometry/Point',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/geometry/Polyline',
    'esri/symbols/SimpleLineSymbol',
    'esri/geometry/Polygon',
    'esri/symbols/SimpleFillSymbol',
    'esri/symbols/TextSymbol',
    'esri/symbols/Font',
    'esri/units',
    'esri/geometry/webMercatorUtils',
    'esri/geometry/geodesicUtils',
    'dojo/_base/lang',
    'dojo/on',
    'dojo/_base/html',
    'dojo/_base/Color',
    'dojo/_base/query',
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
	'jimu/symbolUtils'
  ],
  function(declare,_WidgetsInTemplateMixin,BaseWidget,Graphic,Point,
    SimpleMarkerSymbol,Polyline,SimpleLineSymbol,Polygon,SimpleFillSymbol,
    TextSymbol,Font, esriUnits,webMercatorUtils,geodesicUtils,lang,on,html,
    Color,Query,array, domConstruct, dom, Select,NumberSpinner,ViewStack,SymbolChooser,
    DrawBox, Message, jimuUtils, jimuSymbolUtils) {/*jshint unused: false*/
    return declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'eDraw',
      baseClass: 'jimu-widget-draw',

      postMixInProperties: function(){
        this.inherited(arguments);
        this._resetUnitsArrays();
      },

      postCreate: function() {
        this.inherited(arguments);
        jimuUtils.combineRadioCheckBoxWithLabel(this.showMeasure, this.showMeasureLabel);
        this.drawBox.setMap(this.map);

        this.viewStack = new ViewStack({
          viewType: 'dom',
          views: [this.pointSection, this.lineSection, this.polygonSection, this.textSection]
        });
        html.place(this.viewStack.domNode, this.settingContent);
		
		//Global view (add/list)
		this.globalViewStack = new ViewStack({
          viewType: 'dom',
          views: [this.addSection, this.listSection, this.importExportSection]
        });
		html.place(this.globalViewStack.domNode, this.settingAllContent);
		this.globalViewStack.switchView(this.addSection);
		
        this._initUnitSelect();
        this._bindEvents();
      },
	  
	  _clickAddButon:function(){
		this.globalViewStack.switchView(this.addSection);
		this.addSectionButton.className='menu-item-active';
		this.listSectionButton.className='menu-item';
		this.importExportSectionButton.className='menu-item';
	  },
	  _clickListButon:function(){
		this.showList();
	  },
	  _clickImportExportButon:function(){
	    this.globalViewStack.switchView(this.importExportSection);
		this.addSectionButton.className='menu-item';
		this.listSectionButton.className='menu-item';
		this.importExportSectionButton.className='menu-item-active';
	  },	  
	  
	  _generateDrawTable:function(){
		//Generate draw features table
		var graphics = this.drawBox.drawLayer.graphics;
		var nb_graphics = graphics.length;
		
		//Table
		this.drawsTableBody.innerHTML = "";
		
		for(var i = nb_graphics-1; i>=0;i--){
		  var graphic = graphics[i];
		  var num = i+1;
		  var symbol = graphic.symbol;
		  
		  if(symbol.type=="textsymbol"){
			var json = symbol.toJson();
			var font = (json.font.size < 14) ? 'font-size:'+json.font.size+'px;' : 'font-size:14px; font-weight:bold;';
			var color = (json.color.lenght==4) ? 'rgba('+json.color.join(",")+')' : 'rgba('+json.color.join(",")+')';
			var symbolHtml = '<span style="text-align:center; color:'+color+';'+font+'">'+json.text+'</span>';
		  }else{	
			var symbolNode = jimuSymbolUtils.createSymbolNode(symbol, {width:50, height:50});
			var symbolHtml = symbolNode.innerHTML;
		  }
		  
		  var html = '<td id="draw-symbol--'+i+'">'+symbolHtml+'</td>'
			+ '<td class="list-draw-actions">'
			+		'<span class="clear" id="draw-action-delete--'+i+'">&nbsp;</span>'
			+		'&nbsp;&nbsp;'
			+		'<span class="up" id="draw-action-up--'+i+'">&nbsp;</span>'
			+		'<span class="down" id="draw-action-down--'+i+'">&nbsp;</span>'
			+		'&nbsp;&nbsp;'
			+		'<span class="zoom" id="draw-action-zoom--'+i+'">&nbsp;</span>'
			+ '</td>';
		  
		  
		  var tr = domConstruct.create(
			"tr",
			{
				id : 'draw-tr--'+i,
				innerHTML : html
			},
			this.drawsTableBody
		  );
		  
		  //Bind actions
		  on(dom.byId('draw-action-up--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-down--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-delete--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-zoom--'+i), "click", this.onActionClick);
		}
	  },
	  
	  showList:function(){		
		this._generateDrawTable();
		
		var nb_draws = this.drawBox.drawLayer.graphics.length;
		var display = (nb_draws>0) ? 'block' : 'none';
		html.setStyle(this.allActionsNode,'display',display);
		this.tableTH.innerHTML = nb_draws + ' ' + this.nls.draws;
		
		//Show
		this.globalViewStack.switchView(this.listSection);
	    this.addSectionButton.className='menu-item';
		this.listSectionButton.className='menu-item-active';
		this.importExportSectionButton.className='menu-item';
	  },
	  
	  clear:function(){
		if(confirm(this.nls.clear)){
			this.drawBox.drawLayer.clear();
			this.showList();
		}
	  },
	  
	  import:function(){
		if (!window.FileReader) {
			this.setImportExportMessage(this.nls.importErrorMessageNavigator, 'error');
			return false;
		}
		
		var input = this.importFile.files[0];
		
		if(!input){
			this.setImportExportMessage(this.nls.importErrorWarningSelectFile, 'warning');
			return false;		
		}
		var reader = new FileReader();
		reader.onload= this._importOnFileLoad;
		var txt = reader.readAsText(input);
	  },
	  
	  _importOnFileLoad:function(evt){
			var contents = evt.target.result;
			
			try{
				var json = JSON.parse(contents);
				if(!json.features){
					this.setImportExportMessage(this.nls.importErrorFileStructure, 'error');
					return false;
				}
				for(var i in json.features){
					var json_feat = json.features[i];
					
					var g = new Graphic(json_feat);
					
					if(g)
						 this.drawBox.drawLayer.add(g);
				}
				this.showList();
				this.importFile.files[0]="";
			}
			catch(e){
				this.setImportExportMessage(this.nls.importErrorFileStructure, 'error');
				return false;
			}	
	  },
	  
	  export:function(){
		if(this.drawBox.drawLayer.graphics.length < 1){
			this.setImportExportMessage(this.nls.importWarningNoExport0Draw, 'warning');
			return false;
		}
		
		
		var content = {
			"features":[],
			"displayFieldName" : "",
			"fieldAliases" : {},
			"spatialReference" : this.map.spatialReference.toJson(),
			"fields" : []
		};
		for(var i in this.drawBox.drawLayer.graphics)
			content["features"].push(this.drawBox.drawLayer.graphics[i].toJson());
		
		this.exportButton.href = 'data:application/json;charset=utf-8,'+JSON.stringify(content);
		
		return true;
	  },
	  
	  setImportExportMessage:function(msg, type){
		var p = this.importExportMessage;
		if(!msg || msg==""){
			p.innerHTML = "";
			p.className = "no";
			return;
		}
		var className = 'info';
		if(['error', 'warning'].indexOf(type)!=-1){
			className = type;
		}
		p.innerHTML = msg;
		p.className = className;
	  },
	  
	  _switchGraphics:function(i1, i2){
		var g1 = this.drawBox.drawLayer.graphics[i1];
		var g2 = this.drawBox.drawLayer.graphics[i2];
		
		if(!g1 || !g2)
			return false;
		
		//Switch graphics
		this.drawBox.drawLayer.graphics[i1] = g2;
		this.drawBox.drawLayer.graphics[i2] = g1;
		
		//Redraw in good order
		for(var i in this.drawBox.drawLayer.graphics){
			if(i>=i1 || i >=i2)
				this.drawBox.drawLayer.graphics[i].getShape().moveToFront();		
		}
		return true;		
	  },
	  
	  
	  onActionClick:function(evt){
		if(!evt.target || !evt.target.id)
			return;
		
		var tab = evt.target.id.split('--');
		var type = tab[0];
		var i = parseInt(tab[1]);
		
		var g = this.drawBox.drawLayer.graphics[i];
		
		switch(type){
			case 'draw-action-up':
				this._switchGraphics(i, i+1);
				this._generateDrawTable();
				
				break;
			case 'draw-action-down':
				this._switchGraphics(i, i-1);
				this._generateDrawTable();
				break;
			case 'draw-action-delete':
				if(confirm(this.nls.confirmDrawDelete + ".")){
					g.getLayer().remove(g);
					this.showList();
				}
				break;
			case 'draw-action-zoom':
				if(g.geometry.x){
					this.map.centerAt(g.geometry);
				}
				else if(g.geometry.getExtent){
					var extent = g.geometry.getExtent().expand(1.5);
					this.map.setExtent(extent);
				}
				break;
		}
	  },

      _resetUnitsArrays: function(){
        this.defaultDistanceUnits = [];
        this.defaultAreaUnits = [];
        this.configDistanceUnits = [];
        this.configAreaUnits = [];
        this.distanceUnits = [];
        this.areaUnits = [];
      },

      _bindEvents: function() {
        //bind DrawBox
        this.own(on(this.drawBox,'IconSelected',lang.hitch(this,this._onIconSelected)));
        this.own(on(this.drawBox,'DrawEnd',lang.hitch(this,this._onDrawEnd)));

        //bind symbol change events
        this.own(on(this.pointSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.lineSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.fillSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.textSymChooser,'change',lang.hitch(this,function(symbol){
			this.drawBox.setTextSymbol(symbol);
			this._controlTextIsWritten();
        })));

        //bind unit events
        this.own(on(this.showMeasure,'click',lang.hitch(this,this._setMeasureVisibility)));
		
		//list event
		this.onActionClick = lang.hitch(this, this.onActionClick);
		this._importOnFileLoad = lang.hitch(this, this._importOnFileLoad);
      },

      _onIconSelected:function(target,geotype,commontype){
        this._setDrawDefaultSymbols();
        if(commontype === 'point'){
          this.viewStack.switchView(this.pointSection);
        }
        else if(commontype === 'polyline'){
          this.viewStack.switchView(this.lineSection);
        }
        else if(commontype === 'polygon'){
          this.viewStack.switchView(this.polygonSection);
        }
        else if(commontype === 'text'){
          this.viewStack.switchView(this.textSection);
		  this._controlTextIsWritten(); 
        }
        this._setMeasureVisibility();
      },
	  
	  _controlTextIsWritten : function(){
		var value = this.textSymChooser.inputText.value.trim();
		if(value==""){
			html.setStyle(this.textSymChooser.inputText,'box-shadow','3px 3px 1px 1px rgba(200, 0, 0, 0.7)');
			this.textSymChooser.inputText.focus();
		}
		else{
			html.setStyle(this.textSymChooser.inputText,'box-shadow','none');
		}
	  },

      _onDrawEnd:function(graphic,geotype,commontype){
        var geometry = graphic.geometry;
        if(geometry.type === 'extent'){
          var a = geometry;
          var polygon = new Polygon(a.spatialReference);
          var r=[[a.xmin,a.ymin],[a.xmin,a.ymax],[a.xmax,a.ymax],[a.xmax,a.ymin],[a.xmin,a.ymin]];
          polygon.addRing(r);
          geometry = polygon;
          commontype = 'polygon';
        }
        if(commontype === 'polyline'){
          if(this.showMeasure.checked){
            this._addLineMeasure(geometry);
          }
        }
        else if(commontype === 'polygon'){
          if(this.showMeasure.checked){
            this._addPolygonMeasure(geometry);
          }
        }
		else if(commontype == 'text' && this.textSymChooser.inputText.value.trim() == ""){
			//Message
			new Message({
				type:'question',
				message:this.nls.textWarningMessage
			});
			//Remove empty feature (text symbol without text)
			graphic.getLayer().remove(graphic);
		}
		
		this.viewStack.switchView(false);
		this._setMeasureVisibility();
      },

      _initUnitSelect:function(){
        this._initDefaultUnits();
        this._initConfigUnits();
        var a = this.configDistanceUnits;
        var b = this.defaultDistanceUnits;
        this.distanceUnits = a.length > 0 ? a : b;
        var c = this.configAreaUnits;
        var d = this.defaultAreaUnits;
        this.areaUnits = c.length > 0 ? c : d;
        array.forEach(this.distanceUnits,lang.hitch(this,function(unitInfo){
          var option = {
            value:unitInfo.unit,
            label:unitInfo.label
          };
          this.distanceUnitSelect.addOption(option);
        }));

        array.forEach(this.areaUnits,lang.hitch(this,function(unitInfo){
          var option = {
            value:unitInfo.unit,
            label:unitInfo.label
          };
          this.areaUnitSelect.addOption(option);
        }));
      },

      _initDefaultUnits:function(){
        this.defaultDistanceUnits = [{
          unit: 'KILOMETERS',
          label: this.nls.kilometers
        }, {
          unit: 'MILES',
          label: this.nls.miles
        }, {
          unit: 'METERS',
          label: this.nls.meters
        }, {
          unit: 'FEET',
          label: this.nls.feet
        }, {
          unit: 'YARDS',
          label: this.nls.yards
        }];

        this.defaultAreaUnits = [{
          unit: 'SQUARE_KILOMETERS',
          label: this.nls.squareKilometers
        }, {
          unit: 'SQUARE_MILES',
          label: this.nls.squareMiles
        }, {
          unit: 'ACRES',
          label: this.nls.acres
        }, {
          unit: 'HECTARES',
          label: this.nls.hectares
        }, {
          unit: 'SQUARE_METERS',
          label: this.nls.squareMeters
        }, {
          unit: 'SQUARE_FEET',
          label: this.nls.squareFeet
        }, {
          unit: 'SQUARE_YARDS',
          label: this.nls.squareYards
        }];
      },

      _initConfigUnits:function(){
        array.forEach(this.config.distanceUnits,lang.hitch(this,function(unitInfo){
          var unit = unitInfo.unit;
          if(esriUnits[unit]){
            var defaultUnitInfo = this._getDefaultDistanceUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configDistanceUnits.push(unitInfo);
          }
        }));

        array.forEach(this.config.areaUnits,lang.hitch(this,function(unitInfo){
          var unit = unitInfo.unit;
          if(esriUnits[unit]){
            var defaultUnitInfo = this._getDefaultAreaUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configAreaUnits.push(unitInfo);
          }
        }));
      },

      _getDefaultDistanceUnitInfo:function(unit){
        for(var i=0;i<this.defaultDistanceUnits.length;i++){
          var unitInfo = this.defaultDistanceUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getDefaultAreaUnitInfo:function(unit){
        for(var i=0;i<this.defaultAreaUnits.length;i++){
          var unitInfo = this.defaultAreaUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getDistanceUnitInfo:function(unit){
        for(var i=0;i<this.distanceUnits.length;i++){
          var unitInfo = this.distanceUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getAreaUnitInfo:function(unit){
        for(var i=0;i<this.areaUnits.length;i++){
          var unitInfo = this.areaUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _setMeasureVisibility:function(){
        html.setStyle(this.measureSection,'display','none');
        html.setStyle(this.areaMeasure,'display','none');
        html.setStyle(this.distanceMeasure,'display','none');
        var lineDisplay = html.getStyle(this.lineSection,'display');
        var polygonDisplay = html.getStyle(this.polygonSection,'display');
        if(lineDisplay === 'block'){
          html.setStyle(this.measureSection,'display','block');
          if(this.showMeasure.checked){
            html.setStyle(this.distanceMeasure,'display','block');
          }
        }
        else if(polygonDisplay === 'block'){
          html.setStyle(this.measureSection,'display','block');
          if(this.showMeasure.checked){
            html.setStyle(this.areaMeasure,'display','block');
            html.setStyle(this.distanceMeasure,'display','block');
          }
        }
      },

      _getPointSymbol: function() {
        return this.pointSymChooser.getSymbol();
      },

      _getLineSymbol: function() {
        return this.lineSymChooser.getSymbol();
      },

      _getPolygonSymbol: function() {
        return this.fillSymChooser.getSymbol();
      },

      _getTextSymbol: function() {
        return this.textSymChooser.getSymbol();
      },

      _setDrawDefaultSymbols: function() {
        this.drawBox.setPointSymbol(this._getPointSymbol());
        this.drawBox.setLineSymbol(this._getLineSymbol());
        this.drawBox.setPolygonSymbol(this._getPolygonSymbol());
      },

      onClose: function() {
        this.drawBox.deactivate();
      },

      _addLineMeasure:function(geometry){
        var a = Font.STYLE_ITALIC;
        var b = Font.VARIANT_NORMAL;
        var c = Font.WEIGHT_BOLD;
        var symbolFont = new Font("16px",a,b,c, "Courier");
        var fontColor = new Color([0,0,0,1]);
        var ext = geometry.getExtent();
        var center = ext.getCenter();
        var geoLine = webMercatorUtils.webMercatorToGeographic(geometry);
        var unit = this.distanceUnitSelect.value;
        var lengths = geodesicUtils.geodesicLengths([geoLine],esriUnits[unit]);
        var abbr = this._getDistanceUnitInfo(unit).label;
        var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
        var length = localeLength + " " + abbr;
        var textSymbol = new TextSymbol(length,symbolFont,fontColor);
        var labelGraphic = new Graphic(center,textSymbol,null,null);
        this.drawBox.addGraphic(labelGraphic);
      },

      _addPolygonMeasure:function(geometry){
        var a = Font.STYLE_ITALIC;
        var b = Font.VARIANT_NORMAL;
        var c = Font.WEIGHT_BOLD;
        var symbolFont = new Font("16px",a,b,c, "Courier");
        var fontColor = new Color([0,0,0,1]);
        var ext = geometry.getExtent();
        var center = ext.getCenter();
        var geoPolygon = webMercatorUtils.webMercatorToGeographic(geometry);
        var areaUnit = this.areaUnitSelect.value;
        var areaAbbr = this._getAreaUnitInfo(areaUnit).label;
        var areas = geodesicUtils.geodesicAreas([geoPolygon],esriUnits[areaUnit]);
        var localeArea = jimuUtils.localizeNumber(areas[0].toFixed(1));
        var area = localeArea + " " + areaAbbr;

        var polyline = new Polyline(geometry.spatialReference);
        var points = geometry.rings[0];
        points = points.slice(0,points.length-1);
        polyline.addPath(points);
        var geoPolyline = webMercatorUtils.webMercatorToGeographic(polyline);
        var lengthUnit = this.distanceUnitSelect.value;
        var lengthAbbr = this._getDistanceUnitInfo(lengthUnit).label;
        var lengths = geodesicUtils.geodesicLengths([geoPolyline],esriUnits[lengthUnit]);
        var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
        var length = localeLength + " " + lengthAbbr;
        var text = area + "    " + length;
        var textSymbol = new TextSymbol(text,symbolFont,fontColor);
        var labelGraphic = new Graphic(center,textSymbol,null,null);
        this.drawBox.addGraphic(labelGraphic);
      },

      destroy: function() {
        if(this.drawBox){
          this.drawBox.destroy();
          this.drawBox = null;
        }
        if(this.pointSymChooser){
          this.pointSymChooser.destroy();
          this.pointSymChooser = null;
        }
        if(this.lineSymChooser){
          this.lineSymChooser.destroy();
          this.lineSymChooser = null;
        }
        if(this.fillSymChooser){
          this.fillSymChooser.destroy();
          this.fillSymChooser = null;
        }
        if(this.textSymChooser){
          this.textSymChooser.destroy();
          this.textSymChooser = null;
        }
        this.inherited(arguments);
      },

      startup: function() {
        this.inherited(arguments);
        this.viewStack.startup();
        this.viewStack.switchView(null);
      }
    });
  });