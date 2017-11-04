import fs from 'fs'
import path from 'path'

let style = null

export function activate() {
  return AppEnv.commands.add(document.body, "window:toggle-screenshot-mode", () => {
    if (!style) {
      style = document.createElement('style')
      style.innerText = fs.readFileSync(path.join(__dirname, '..', 'assets','font-override.css')).toString()
    }

    if (style.parentElement) {
      document.body.removeChild(style)
    }
    else {
      document.body.appendChild(style)
    }
  })
}

export function deactivate() {
  if (style && style.parentElement) {
    return document.body.removeChild(style)
  }
}