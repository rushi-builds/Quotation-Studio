/* Public gallery — personal project collections.

   A visitor can save ("pin") any project photograph to their own collection.
   The collection lives in localStorage only - no account, no server, nothing
   personal leaves the browser. A saved project keeps its place in the grid
   and shows a filled bookmark; opening it from the collection opens the same
   detail view as anywhere else.
 */
'use strict';
(function (root) {
  var KEY = 'qs_gallery_collection';
  var MAX = 50;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(function (id) { return typeof id === 'string' && id.length; });
    } catch (_) { /* ignore corrupted storage */ }
    return [];
  }
  function write(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX))); } catch (_) { /* storage full or blocked */ }
  }
  function has(id) { return read().indexOf(id) >= 0; }
  function add(id) {
    var ids = read();
    if (ids.indexOf(id) >= 0) return ids;
    ids.push(id);
    write(ids);
    return ids;
  }
  function remove(id) {
    var ids = read().filter(function (x) { return x !== id; });
    write(ids);
    return ids;
  }
  function toggle(id) { return has(id) ? remove(id) : add(id); }

  root.GalleryCollections = {
    read: read,
    has: has,
    add: add,
    remove: remove,
    toggle: toggle,
    size: function () { return read().length; }
  };
})(window);
