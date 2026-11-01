import React from 'react';
import { HarperRules, localized } from 'mailspring-exports';
import type {
  HarperPreset,
  HarperRuleCatalog,
  HarperRuleGroup,
} from '../../../../src/harper-rules';
import { ConfigLike } from '../types';

const PRESETS: { id: HarperPreset; label: () => string }[] = [
  { id: 'essentials', label: () => localized('Essentials: mistakes only') },
  { id: 'recommended', label: () => localized('Recommended: Harper defaults') },
  { id: 'everything', label: () => localized('Everything: includes style suggestions') },
];

// Harper rule names are PascalCase identifiers, and its descriptions are Markdown.
const ruleTitle = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const plainText = (markdown: string) => markdown.replace(/[`*]/g, '');

export default class HarperRulesSection extends React.Component<
  { config: ConfigLike },
  { catalog: HarperRuleCatalog | null; failed: boolean; query: string; open: string[] }
> {
  state = {
    catalog: null as HarperRuleCatalog | null,
    failed: false,
    query: '',
    open: [] as string[],
  };

  _mounted = false;

  componentDidMount() {
    this._mounted = true;
    HarperRules.catalog().then(
      (catalog) => this._mounted && this.setState({ catalog }),
      () => this._mounted && this.setState({ failed: true })
    );
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _matchingGroups(catalog: HarperRuleCatalog): HarperRuleGroup[] {
    const query = this.state.query.trim().toLowerCase();
    if (!query) return catalog.groups;
    return catalog.groups
      .map((group) => ({
        ...group,
        rules: group.rules.filter((rule) =>
          `${ruleTitle(rule.name)} ${rule.name} ${rule.description}`.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.rules.length > 0);
  }

  _renderGroup(group: HarperRuleGroup, catalog: HarperRuleCatalog) {
    const { config } = this.props;
    const names = group.rules.map((rule) => rule.name);
    const enabledCount = names.filter((name) =>
      HarperRules.isEnabled(name, catalog, config)
    ).length;
    const searching = !!this.state.query.trim();
    const open = searching || this.state.open.includes(group.label);

    return (
      <details
        key={group.label}
        open={open}
        onToggle={(event) => {
          if (searching) return;
          const isOpen = (event.target as HTMLDetailsElement).open;
          this.setState(({ open: current }) => ({
            open: isOpen
              ? [...new Set([...current, group.label])]
              : current.filter((label) => label !== group.label),
          }));
        }}
      >
        <summary title={group.description}>
          <input
            type="checkbox"
            aria-label={group.label}
            checked={enabledCount === names.length}
            ref={(el) => {
              if (el) el.indeterminate = enabledCount > 0 && enabledCount < names.length;
            }}
            onChange={(event) =>
              HarperRules.setRules(names, event.target.checked, catalog, config as any)
            }
          />
          <span className="harper-group-label">{group.label}</span>
          <span className="harper-group-count">
            {enabledCount}/{names.length}
          </span>
        </summary>
        {open &&
          group.rules.map((rule) => (
            <label key={rule.name} className="harper-rule">
              <input
                type="checkbox"
                checked={HarperRules.isEnabled(rule.name, catalog, config)}
                onChange={(event) =>
                  HarperRules.setRules([rule.name], event.target.checked, catalog, config as any)
                }
              />
              <span>
                {ruleTitle(rule.name)}
                <small>{plainText(rule.description)}</small>
              </span>
            </label>
          ))}
      </details>
    );
  }

  render() {
    const { config } = this.props;
    const { catalog, failed, query } = this.state;
    const overrideCount = HarperRules.enabled(config).size + HarperRules.disabled(config).size;
    const allRules = catalog ? catalog.groups.flatMap((group) => group.rules) : [];
    const enabledCount = catalog
      ? allRules.filter((rule) => HarperRules.isEnabled(rule.name, catalog, config)).length
      : 0;

    return (
      <div className="harper-rules item">
        <label htmlFor="harper-preset">{localized('Harper rules')}</label>
        <select
          id="harper-preset"
          value={HarperRules.preset(config)}
          onChange={(event) => config.set(HarperRules.presetKey, event.target.value)}
        >
          {PRESETS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label()}
            </option>
          ))}
        </select>
        <div className="harper-rules-summary" role="status">
          {failed && <span>{localized('Could not load Harper rules.')}</span>}
          {catalog && (
            <span>{localized('%1$@ of %2$@ rules enabled', enabledCount, allRules.length)}</span>
          )}
          {overrideCount > 0 && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => HarperRules.resetOverrides(config as any)}
            >
              {localized('Reset %@ custom rules', overrideCount)}
            </button>
          )}
        </div>
        {catalog && (
          <React.Fragment>
            <input
              type="search"
              aria-label={localized('Search Harper rules')}
              placeholder={localized('Search rules')}
              value={query}
              onChange={(event) => this.setState({ query: event.target.value })}
            />
            <div className="harper-rules-groups">
              {this._matchingGroups(catalog).map((group) => this._renderGroup(group, catalog))}
            </div>
          </React.Fragment>
        )}
      </div>
    );
  }
}
