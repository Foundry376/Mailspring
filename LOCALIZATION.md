# Localization / Internationalization

Mailspring 1.5 and above support localization - the app's menus, messages, buttons, and more are loaded from language files based on the user's locale. This makes the app accessible to millions of people around the world and helps it blend in on your desktop!

Providing localization in many languages is a challenge, and automatic translation often does a poor job of technical text. Mailspring's initial translation in ~90 languages was accomplished using a database of human-translated email terms and technical phrases (eg: "Archive", "Send message", etc.) supplemented with Google's NLT Translation API. If you use your computer in another language and also speak English, contributing translations to Mailspring is a great way to impact the open source project and could greatly improve localization quality!

## Contributing Localizations

#### Option 1: Suggest Changes

From within Mailspring, choose "Developer > Toggle Localizer Tools" from the menu. A yellow bar appears at the bottom of the window. From here, you can use the small "Inspect" button to click text in the window which is untranslated or poorly translated. Type a new translation and click "Submit"!

_Note: These translations are reviewed manually and a Mailspring maintainer will change the necessary files._

#### Option 2: Submit a Pull Request

If you have a GitHub account, you can improve the localization files directly and submit a Pull Request! If you're interested in providing many translations, or translating things like network error messages you may not ever see yourself, this is the best bet. It also means you'll be recognized as a Mailspring contributor and the Mailspring project will appear on your GitHub profile!

You'll find the localization files in [app/lang](https://github.com/Foundry376/Mailspring/tree/master/app/lang) named according to the "Language tag" standard. If you're not sure what language tag applies to your language, check the [ISO 639-1 lookup table](http://www.loc.gov/standards/iso639-2/php/English_list.php). To modify the file on GitHub and submit a pull request, click the "Pencil Icon" when viewing the file as shown [here](https://help.github.com/articles/editing-files-in-your-repository/).

Each file contains a JSON dictionary mapping an English string to a translated string. For example:

```
{
  "%@ of %@": "%1$@ de %2$@",
  "Accept": "Aceptar",
  "Account": "Cuenta",
  "Moved to %@": "Movido a %@"
}
```

The example above shows two examples of variable substitution. Some strings in Mailspring display text the user provides, like a folder name. In the localized strings, placeholders (`%@`) represent this text.

If a string contains multiple placeholders, you can optionally reference the variables by index using the `%2$@` syntax. Using `2` means this placeholder should be replaced with the second placeholder in the English string. This allows you to change the order variables appear, which is important for languages like Japanese.

## Running Mailspring with a Specific Locale

It can be useful to run Mailspring with a specific locale. To do this, pass the `lang` flag at launch. For example:

```
/Applications/Mailspring.app/Contents/MacOS/Mailspring --lang=de
```

Or, when developing th app and running it from your working copy:

```
npm start -- --lang=de
```
