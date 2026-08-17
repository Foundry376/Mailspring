# Composer Templates

Create templates you can use to pre-fill the N1 composer - never type the same
email again! Templates live in the templates folder inside the Mailspring config folder.

Each template is an HTML file - the name of the file is the name of the template,
and it's contents are the default message body.

A template can also carry a subject line, which is stored in a `<meta>` tag at the
very top of the file:

```html
<meta name="subject" content="Following up on our call"/>
<div>Hey there!</div>
```

When you insert the template, the subject is filled into your draft. Templates
without the meta tag leave the draft's subject alone, and the subject of a reply or
a forward is never overwritten. If your draft already has a subject, Mailspring
asks before replacing it. The same rule applies in reverse: saving a reply or a
forward with "Save Draft as Template" keeps the body but not the subject.

If you include HTML &lt;code&gt; tags in your template, you can create
regions that you can jump between and fill easily.
Give &lt;code&gt; tags the `var` class to mark them as template regions. Add
the `empty` class to make them dark yellow. When you send your message, &lt;code&gt;
tags are always stripped so the recipient never sees any highlighting.

This example is a good starting point for plugins that want to extend the composer
experience.

<img src="https://raw.githubusercontent.com/nylas/nylas-mail/master/internal_packages/composer-templates/screenshot.png">
