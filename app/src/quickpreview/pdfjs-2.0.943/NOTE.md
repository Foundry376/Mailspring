The contents of this folder are pulled from https://github.com/mozilla/pdf.js/tree/gh-pages.
We can't use the npm distribution because:

1.  It includes a bunch of extra files including a sample PDF and 6MB of source maps.

2.  It does not include the viewer.html file, which must be in the correct
    relative location to work.

3.  The viewer.html file here has been modified to:
    * Hide the open file button
    * Not change the window title
