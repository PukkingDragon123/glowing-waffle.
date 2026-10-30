// Tiny virtual filesystem. Paths look like "/My Documents/note.txt".
// Nodes: { type:'dir', name, kids:[] } | { type:'txt', name, text, dyn? } | { type:'img', name, gen?|data? }

export class VFS {
  constructor(tree) { this.root = tree; }
  static split(path) { return String(path).split('/').filter(Boolean); }
  get(path) {
    let n = this.root;
    for (const part of VFS.split(path)) {
      if (!n || n.type !== 'dir') return null;
      n = n.kids.find((k) => k.name.toLowerCase() === part.toLowerCase());
    }
    return n || null;
  }
  parentPath(path) { const p = VFS.split(path); p.pop(); return '/' + p.join('/'); }
  join(dir, name) { return (dir === '/' ? '' : dir.replace(/\/$/, '')) + '/' + name; }
  list(path) { const n = this.get(path); return n?.type === 'dir' ? n.kids : []; }
  uniqueName(dir, base, ext) {
    const names = new Set(this.list(dir).map((k) => k.name.toLowerCase()));
    let name = base + ext, i = 2;
    while (names.has(name.toLowerCase())) name = `${base} (${i++})${ext}`;
    return name;
  }
  write(dir, node) {
    const d = this.get(dir); if (!d || d.type !== 'dir') return null;
    const ex = d.kids.findIndex((k) => k.name.toLowerCase() === node.name.toLowerCase());
    node.modified = Date.now();
    if (ex >= 0) d.kids[ex] = node; else d.kids.push(node);
    return this.join(dir, node.name);
  }
  mkdir(dir, name) { return this.write(dir, { type: 'dir', name, kids: [] }); }
  remove(path) {
    const n = this.get(path); if (!n || n.system) return false;
    const parent = this.get(this.parentPath(path));
    parent.kids = parent.kids.filter((k) => k !== n);
    const bin = this.get('/Recycle Bin');
    if (bin && !path.startsWith('/Recycle Bin')) { n.origin = this.parentPath(path); bin.kids.push(n); }
    return true;
  }
  restore(name) {
    const bin = this.get('/Recycle Bin'); const n = bin?.kids.find((k) => k.name === name); if (!n) return false;
    bin.kids = bin.kids.filter((k) => k !== n);
    const dest = this.get(n.origin || '/My Documents') ? n.origin || '/My Documents' : '/My Documents';
    delete n.origin; n.name = this.uniqueName(dest, n.name.replace(/(\.[^.]+)$/, ''), (n.name.match(/\.[^.]+$/) || [''])[0]);
    this.write(dest, n); return true;
  }
  emptyBin() { const bin = this.get('/Recycle Bin'); if (bin) bin.kids = []; }
  rename(path, newName) {
    const n = this.get(path); if (!n || n.system) return false;
    const siblings = this.list(this.parentPath(path));
    if (siblings.some((k) => k !== n && k.name.toLowerCase() === newName.toLowerCase())) return false;
    n.name = newName; return true;
  }
  serialize() { return JSON.parse(JSON.stringify(this.root)); }
}

export const fileIcon = (n) => !n ? 'exe' : n.type === 'dir' ? (n.name === 'Recycle Bin' ? (n.kids.length ? 'bin_full' : 'bin_empty') : 'folder') : n.type === 'img' ? 'img' : n.type === 'lnk' ? n.icon || 'exe' : 'txt';
