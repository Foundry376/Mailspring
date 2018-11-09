
export type StanzaClass = any;
export type Stanza = any;
export type XML = any;

export interface JXTUtils {
    parse(str: string): XML;
    createElement(namespace: string, name: string, parentNamespace?: string): XML;
    find(xml: XML, namespace: string, selector: string): XML[];
    findOrCreate(xml: XML, namespace: string, selector: string): XML;
    getAttribute(xml: XML, name: string, defaultValue?: string): string;
    getAttributeNS(xml: XML, namespace: string, name: string, defaultValue?: string): string;
    setAttribute(xml: XML, name: string, value: any, force?: boolean): void;
    setAttributeNS(xml: XML, namespace: string, name: string, value: any, force?: boolean): void;
    getBoolAttribute(xml: XML, name: string, defaultValue?: boolean): boolean;
    setBoolAttribute(xml: XML, name: string, value: boolean): void;
    getSubAttribute(xml: XML, namespace: string, element: string, name: string, defaultValue?: string): string;
    setSubAttribute(xml: XML, namespace: string, element: string, name: string, value: string): void;
    getBoolSubAttribute(xml: XML, namespace: string, element: string, name: string, defaultValue?: boolean): boolean;
    setBoolSubAttribute(xml: XML, namespace: string, element: string, name: string, value: boolean): void;
    getText(xml: XML): string;
    setText(xml: XML, text: string): void;
    getSubText(xml: XML, namespace: string, element: string, defaultValue?: string): string;
    setSubText(xml: XML, namespace: string, element: string, value: string): void;
    getMultiSubText(xml: XML, namespace: string, element: string, extractor?: (xml: XML) => string): string[];
    setMultiSubText(xml: XML, namespace: string, element: string, value: string | string[], builder?: (xml: XML, value: string) => void): void;
    getMultiSubAttribute(xml: XML, namespace: string, element: string, name: string): string[];
    setMultiSubAttribute(xml: XML, namespace: string, element: string, name: string, value: string[]): void;
    getSubLangText(xml: XML, namespace: string, element: string, defaultLang?: string): string;
    setSubLangText(xml: XML, namespace: string, element: string, value: string, defaultLang?: string): void;
    getBoolSub(xml: XML, namespace: string, element: string): boolean;
    setBoolSub(xml: XML, namespace: string, element: string, value: boolean): void;

    field(getter: Function, setter: Function): Field;
    boolAttribute(name: string): Field;
    subAttribute(namespace: string, element: string, name: string): Field;
    boolSubAttribute(namespace: string, element: string, name: string): Field;
    text(): Field;
    textSub(namespace: string, element: string): Field;
    multiTextSub(namespace: string, element: string): Field;
    multiSubAttribute(namespace: string, element: string, name: string): Field;
    langTextSub(namespace: string, element: string, defaultValue?: string): Field;
    boolSub(namespace: string, element: string): Field;
    langAttribute(): Field;
    b64Text(): Field;
    dateAttribute(name: string, now?: boolean): Field;
    dateSub(namespace: string, element: string, now?: boolean): Field;
    dateSubAttribute(namespace: string, element: string, name: string, now?: boolean): Field;
    numberAttribute(name: string, isFloat?: boolean, defaultVlaue?: number): Field;
    numberSub(namespace: string, element: string, isFloat?: boolean, defaultValue?: number): Field;
    attribute(name: string, defaultValue?: string): Field;
    attributeNS(namespace: string, name: string, defaultValue?: string): Field;
    extension(stanza: StanzaClass): Field;
    multiExtension(stanza: StanzaClass): Field;
    enumSub(namespace: string, values: string[]): Field;
    subExtension(name: string, namespace: string, element: string, stanza: StanzaClass): Field;
    subMultiExtension(namespace: string, element: string, stanza: StanzaClass): Field;
}

export interface Field {
    get?: () => any;
    set?: (value: any) => void;
    value?: any;
}

export class JXT {
    public utils: JXTUtils;

    public use(init: (jxt: JXT) => void): void;
    public getDefinition(element: string, namespace: string, required?: boolean): StanzaClass;
    public getExtensions(element: string, namespace: string): StanzaClass[];
    public withDefinition(element: string, namespace: string, handler: (stanza: Stanza) => void): void;
    public withTag(tag: string, handler: (stanza: Stanza) => void): void;
    public tagged(tag: string): Stanza[];
    public build(xml: XML): Stanza;
    public parse(str: string): XML;
    public extend(parentJXT: StanzaClass, childJXT: StanzaClass, multiName?: string, hideSingle?: boolean): void;
    public add(parentJXT: StanzaClass, fieldName: string, field: any): void;
    public define(opts: {
        name: string;
        namespace: string;
        element?: string;
        prefixes?: { [key: string]: string };
        tags?: string[];
        topLevel?: boolean;
        eventName?: string;
        init?: (self: Stanza, data: any) => void;
        fields?: { [key: string]: Field };
    }): StanzaClass;
}

export function createRegistry(): JXT;
