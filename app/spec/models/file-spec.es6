const File = require('../../src/flux/models/file').default;

const test_file_path = "/path/to/file.jpg";

describe("File", function() {
  it("attempts to generate a new file upload task on creation", function() {});
    // File.create(test_file_path)

  describe("displayName", function() {
    it("should return the filename if populated", function() {
      let f = new File({filename: 'Hello world.jpg', contentType: 'image/jpg'});
      expect(f.displayName()).toBe('Hello world.jpg');
      f = new File({filename: 'a', contentType: 'image/jpg'});
      expect(f.displayName()).toBe('a');
    });

    it("should return a good default name if a content type is populated", function() {
      let f = new File({filename: '', contentType: 'image/jpg'});
      expect(f.displayName()).toBe('Unnamed Image.jpg');
      f = new File({filename: null, contentType: 'image/jpg'});
      expect(f.displayName()).toBe('Unnamed Image.jpg');
      f = new File({filename: null, contentType: 'text/calendar'});
      expect(f.displayName()).toBe('Event.ics');
    });

    it("should return Unnamed Attachment otherwise", function() {
      let f = new File({filename: '', contentType: null});
      expect(f.displayName()).toBe('Unnamed Attachment');
      f = new File({filename: null, contentType: ''});
      expect(f.displayName()).toBe('Unnamed Attachment');
      f = new File({filename: null, contentType: null});
      expect(f.displayName()).toBe('Unnamed Attachment');
    });
  });

  describe("displayExtension", function() {
    it("should return an extension based on the filename when populated", function() {
      let f = new File({filename: 'Hello world.jpg', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('jpg');
      f = new File({filename: 'a', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('');
    });

    it("should ignore the case of the extension i nthe filename", function() {
      let f = new File({filename: 'Hello world.JPG', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('jpg');
      f = new File({filename: 'Hello world.Jpg', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('jpg');
      f = new File({filename: 'Hello world.jpg', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('jpg');
    });

    it("should return an extension based on the default filename otherwise", function() {
      let f = new File({filename: '', contentType: 'image/jpg'});
      expect(f.displayExtension()).toBe('jpg');
      f = new File({filename: null, contentType: 'text/calendar'});
      expect(f.displayExtension()).toBe('ics');
    });
  });
});
