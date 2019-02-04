# esri-webappbuilder-widget-eDraw
Ehanced draw widget for WebApp Builder for Arcgis.

Fork and modifications of the official widget draw for WebApp Builder for Arcgis :
http://doc.arcgis.com/en/web-appbuilder/create-apps/widget-draw.htm

The widget use the proj4js library (https://github.com/proj4js/proj4js) for point's lat/lon measure (for non mercator maps) :
https://github.com/proj4js/proj4js

## Improvements:
- add name and description fields on drawings
- enable infowindow on drawings (selection)
- on text drawing, no insert if no name.
- on modification : enable geometry update (with snapping if wanted : CTRL) and preview symbology changes on the fly
- list
    - add list of all drawings
    - actions on each drawing : modify / delete / [up / down] / zoom
    - all drawings : zoom, copy, delete, export
    - on drawing infowindow -> select drawing in list
    - on zoom on a drawing -> select drawing on map (and show infoWindow)
    - re-order graphics with drag&drop
- import/export : allow users to export or import drawings (json format)
    - import can be done with file drag&drop in import popup
- localStorage
    - dynamic saving on each drawing add/delete/update
    - on widget load : load drawings saved in local Storage
- draws plus (initially from Larry Stout https://geonet.esri.com/people/Larry_Stout)
    - preview under mouse when adding text or point
    - for text, add font choice, font angle, bold, italic, placement and underline options.
    - add arrow menu for polyline
- checkbox to hide drawing's layer (and therefore widget UI)
- add of Nautical unit
- measure's for points/polylines/polygons with automatic update on element's update (or delete). Measure's can be individually disabled/enabled on any graphic.
- "On the fly" measure when drawing
- defaults symbols can be specified in config's file
- use of builtin projection engine (available since esri js api 3.24) instead of proj4js library

## configuration :
- export file name.
- Confirm on delete. A confirm dialog when user delete drawing(s) ?
- add up/down buttons in list ? (N.B. : re-ordering can be done with drag&drop)
- Enable local storage. enable auto-saving in local storage and loading saved drawings on widget load.
    - Local storage key : let empty or set a name :
        - if empty, all apps with eDraw widgets share the same local storage (apps on the same server)
        - if not empty, all apps with the same key share the same local storage (apps on the same server)
- Choose availables font families in text plus
- (without UI) set default symbols
- enable measure by default ? (is measure checkbox checked on polygon/polyline/point add ?)
- measure's labels patterns
        
## Installation :
Add eDraw folder in your webApp Builder client\stemapp\widgets folder.
Download Release here : 
https://github.com/magis-nc/esri-webappbuilder-widget-eDraw/releases/latest

## Demo :
http://apps.magis.nc/maps/wab-widgets/?extent=17918900%2C-2706198%2C19092972%2C-2154016%2C102100
