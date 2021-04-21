/*
 * BSD 3-Clause License
 *
 * Copyright (c) 2021, 8minute Solar Energy LLC
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

 /* jshint esversion: 6 */

define([
  'esri/SpatialReference',
  'esri/geometry/projection',
],
function(SpatialReference, projection) {

  class Node {
    /* Class to simplify creation of XML documents.
     *
     * Eliminates repetitive code that makes it difficult to read.
     * Methods and getters return Node objects to allow call chaining.
     */

    constructor(elem) {
      // elem should be an XML DOM Element object
      this.elem = elem;
    }

    // Helpers to return the parent (enclosing) node
    get parent() { return new Node(this.elem.parentNode); }
    get end() { return new Node(this.elem.parentNode); }

    using(func) {
      // Call function with the current node
      func(this);
      return this;
    }

    forEach(items, func) {
      // Call func(node, item) for each item in array it
      items.forEach(function(item) { func(this, item); }, this);
      return this;
    }

    add(name) {
      // Append a new child element to the node
      //
      // name is the tag name to append.  Namespace tags are supported using
      // `ns:name`, but the namespace must already exist on the document.

      let doc = this.elem.ownerDocument;
      let index = name.indexOf(':');
      let xmlns = index == -1 ? doc.documentElement.namespaceURI :
        doc.documentElement.getAttribute(`xmlns:${name.substring(0, 2)}`);
      let elem = doc.createElementNS(xmlns, name);
      this.elem.appendChild(elem);
      return new Node(elem);
    }

    dropIfEmpty() {
      // Drop the node if no child nodes were added
      let parent = this.elem.parentNode;
      if (this.elem.firstChild === null) {
        parent.removeChild(this.elem);
      }
      return new Node(parent);
    }

    dropUnused() {
      // Drop a container node if there are insufficient child nodes
      let parent = this.elem.parentNode;
      let children = this.elem.childNodes;
      if (children.length < 2) {
        for (let child of children) {
          this.elem.removeChild(child);
          parent.appendChild(child);
        }
        parent.removeChild(this.elem);
      }
      return new Node(parent);
    }

    text(text) {
      // Add and return a text node
      this.elem.appendChild(this.elem.ownerDocument.createTextNode(text));
      return this;
    }

    cdata(text) {
      // Add and return a CDATA node
      this.elem.appendChild(this.elem.ownerDocument.createCDATASection(text));
      return this;
    }

    attr(name, value) {
      // Set an attribute on the node
      this.elem.setAttribute(name, value);
      return this;
    }
  }


  function colorToHex(color) {
    // Convert ArcGIS color to KML hex color
    return [~~(color.a * 255), color.b, color.g, color.r].map(function(value) {
      let s = value.toString(16);
      return '0'.repeat(2 - s.length) + s;
    }).join('');
  }


  function symbolStyle(node, symbol) {
    // Add style to node to match symbol as best as possible
    switch (symbol.type) {
      case 'simplelinesymbol':
        node.add('LineStyle').
          add('color').text(colorToHex(symbol.color)).end.
          add('width').text(symbol.width * 4 / 3);
        break;

      case 'simplefillsymbol':
        node.add('PolyStyle').
          add('color').text(colorToHex(symbol.color)).end.
          add('fill').text('1').end.
          add('outline').text('1');
        symbolStyle(node, symbol.outline);
        break;

      case 'picturemarkersymbol':
        node.add('IconStyle').
          add('Icon').
            add('href').text(symbol.imageData || symbol.url);
        break;

      case 'simplemarkersymbol':
        node.add('IconStyle').
          add('color').text(colorToHex(symbol.color));
        break;

      case 'textsymbol':
        node.add('LabelStyle').
          add('color').text(colorToHex(symbol.color));
        break;

      case 'picturefillsymbol':
      default:
        break;
    }
  }


  return {
    graphicsToKml: function(graphics) {
      // Convert a list of graphics objects to an KML document and return XMLDocument object.
      //
      // Returns false if no graphics are given.

      if (!graphics.length)
        return null;

      const wgs84 = SpatialReference({wkid: 4326});

      let doc = (new DOMParser()).parseFromString(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"></kml>`, 'application/xml');
      let root = new Node(doc.documentElement);

      root.add('Document').
        add('name').text('Drawings').end.
        forEach(graphics, function(node, graphic) {
          let geometry = graphic.geometry;
          if (geometry.spatialReference.wkid != wgs84.wkid) {
            Promise.resolve(projection.load());
            geometry = projection.project(geometry, wgs84);
          }

          node.add('Placemark').
            add('name').text(graphic.attributes.name).end.
            add('description').cdata(graphic.attributes.description).end.
            add('Style').using(function(node) { symbolStyle(node, graphic.symbol); }).dropIfEmpty().
            add('MultiGeometry').
              using(function(node) {
                switch (geometry.type) {
                  case 'point':
                    node.add('Point').
                      add('coordinates').text(`${geometry.x},${geometry.y},${geometry.hasZ ? geometry.z || 0 : 0}`);
                    break;

                  case 'polyline':
                    node.forEach(geometry.paths, function(node, path) {
                      node.add('LineString').
                        add('extrude').text('0').end.
                        add('altitudeMode').text('clampToGround').end.
                        add('coordinates').text(
                          path.map(function([x, y, z=0]) { return `${x},${y},${geometry.hasZ ? z : 0}`; }).join(' '));
                    });
                    break;

                  case 'polygon':
                    node.forEach(geometry.rings, function(node, ring) {
                      node.add('Polygon').
                        add('extrude').text('0').end.
                        add('altitudeMode').text('clampToGround').end.
                        add('outerBoundaryIs').
                          add('LinearRing').
                            add('coordinates').text(
                              ring.map(function([x, y, z=0]) { return `${x},${y},${geometry.hasZ ? z : 0}`; }).join(' '));
                    });
                    break;

                  default:
                    break;
                }
              }).dropUnused();
        });

      return doc;
    },

  };
});
