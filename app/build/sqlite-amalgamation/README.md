# Custom configuration

If you want to use a customized version of [SQLite3](https://www.sqlite.org) with `better-sqlite3`, you can do so by specifying the directory of your [custom amalgamation](https://www.sqlite.org/amalgamation.html) during installation.

```bash
npm install better-sqlite3 --build-from-source --sqlite3=/path/to/sqlite-amalgamation
```

However, if you simply run `npm install` while `better-sqlite3` is listed as a dependency in your `package.json`, the required flags above will *not* be applied. Therefore, it's recommended that you remove `better-sqlite3` from your dependency list, and instead add a [`preinstall` script](https://docs.npmjs.com/misc/scripts) like the one shown below.

```json
{
  "scripts": {
    "preinstall": "npm install better-sqlite3@'^7.0.0' --no-save --build-from-source --sqlite3=\"$(pwd)/sqlite-amalgamation\""
  }
}
```

Your amalgamation directory must contain `sqlite3.c` and `sqlite3.h`. Any desired [compile time options](https://www.sqlite.org/compile.html) must be defined directly within `sqlite3.c`.

### Step by step example

If you're creating a package that relies on a custom build of `better-sqlite3`, you can follow these steps to get started.

1. Download the SQLite3 source code from [their website](https://sqlite.com/download.html) (e.g., `sqlite-amalgamation-1234567.zip`)
2. Unzip the compressed archive
3. Move the `sqlite3.c` and `sqlite3.h` files to your project folder
4. Add a `preinstall` script to your `package.json`, like the one shown above
5. Make sure the `--sqlite3` flag points to the location of your `sqlite3.c` and `sqlite3.h` files
6. Define your preferred [compile time options](https://www.sqlite.org/compile.html) at the top of `sqlite3.c`
7. Run `npm install` in your project folder

If you're using a SQLite3 encryption extension that is a drop-in replacement for SQLite3 (such as [SEE](https://www.sqlite.org/see/doc/release/www/readme.wiki) or [sqleet](https://github.com/resilar/sqleet)), then simply replace `sqlite3.c` and `sqlite3.h` with the source files of your encryption extension.

# Bundled configuration

By default, this distribution currently uses SQLite3 **version 3.35.2** with the following [compilation options](https://www.sqlite.org/compile.html):

```
SQLITE_DQS=0
SQLITE_LIKE_DOESNT_MATCH_BLOBS
SQLITE_THREADSAFE=2
SQLITE_USE_URI=0
SQLITE_DEFAULT_MEMSTATUS=0
SQLITE_OMIT_DEPRECATED
SQLITE_OMIT_GET_TABLE
SQLITE_OMIT_TCL_VARIABLE
SQLITE_OMIT_PROGRESS_CALLBACK
SQLITE_OMIT_SHARED_CACHE
SQLITE_TRACE_SIZE_LIMIT=32
SQLITE_DEFAULT_CACHE_SIZE=-16000
SQLITE_DEFAULT_FOREIGN_KEYS=1
SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
SQLITE_ENABLE_COLUMN_METADATA
SQLITE_ENABLE_UPDATE_DELETE_LIMIT
SQLITE_ENABLE_STAT4
SQLITE_ENABLE_FTS3_PARENTHESIS
SQLITE_ENABLE_FTS3
SQLITE_ENABLE_FTS4
SQLITE_ENABLE_FTS5
SQLITE_ENABLE_JSON1
SQLITE_ENABLE_RTREE
SQLITE_ENABLE_GEOPOLY
SQLITE_INTROSPECTION_PRAGMAS
SQLITE_SOUNDEX
```
