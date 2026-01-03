# Plugin Development Skill

Use this skill when working on code related to Mailspring's plugin system, including:
- Creating, modifying, or debugging plugins/packages
- Working with the PackageManager or Package classes
- Modifying plugin loading, discovery, or activation logic
- Working with ComponentRegistry, ExtensionRegistry, or other registries
- Implementing plugin marketplace or plugin management UI features
- Working with themes (which are a type of plugin)
- Modifying code in `app/internal_packages/`

## Required Reading

Before making changes to plugin-related code, you MUST read the plugin system architecture documentation:

```
/home/user/Mailspring/PLUGIN_SYSTEM_ARCHITECTURE.md
```

This document contains comprehensive information about:
- Plugin directory locations and discovery
- Plugin structure and package.json schema
- Plugin lifecycle (activate/deactivate)
- Extension points and registries (ComponentRegistry, ExtensionRegistry, etc.)
- User plugin installation mechanisms
- Theme system implementation
- Current limitations and opportunities

## Key Source Files

When working on plugin functionality, these are the primary files to understand:

| File | Purpose |
|------|---------|
| `app/src/package-manager.ts` | Package discovery, validation, and activation |
| `app/src/package.ts` | Package class representing individual plugins |
| `app/src/app-env.ts` | AppEnv singleton that initializes PackageManager |
| `app/src/registries/component-registry.ts` | UI component registration |
| `app/src/registries/extension-registry.ts` | Extension registration |
| `app/src/extensions/composer-extension.ts` | ComposerExtension base class |
| `app/src/extensions/message-view-extension.ts` | MessageViewExtension base class |
| `app/src/components/injected-component.tsx` | Renders registered components |
| `app/internal_packages/theme-picker/` | Theme UI (reference for plugin management UI) |

## Development Guidelines

1. **Plugin Validation**: All plugins must have `engines.mailspring` in package.json
2. **Lifecycle Compliance**: Plugins must export `activate()` and `deactivate()` functions
3. **Clean Deactivation**: Always unregister components/extensions in `deactivate()`
4. **Window Types**: Consider which window types a plugin should load in
5. **Optional Plugins**: Use `isOptional: true` for user-disableable plugins

## Testing Plugin Changes

- Use `npm start` to run in dev mode (uses `Mailspring-dev` config directory)
- Hot reload with `Ctrl+R` / `Cmd+R`
- Access `$m` in dev console for `mailspring-exports`
- User plugins go in `~/.config/Mailspring-dev/packages/` during development
