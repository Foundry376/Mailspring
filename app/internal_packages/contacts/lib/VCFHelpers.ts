import { ContactBase } from './ContactController';

export const asArray = (obj: any | Array<any>) => {
  if (obj instanceof Array) return obj;
  return obj ? [obj] : [];
};

export const asSingle = (obj: any | Array<any>) => {
  if (obj instanceof Array) return obj[0];
  return obj;
};

export const parseBirthday = (date: string) => {
  const [year, month, day] = [...date.split('-'), -1, -1, -1];
  return { year: Number(year), month: Number(month), day: Number(day) };
};

export const removeRandomSemicolons = (value: string) => {
  return value
    .replace(/;/g, ' ')
    .replace(/  +/g, ' ')
    .trim();
};

export const parseAddress = (item: any) => {
  const [A, AddrLine1, AddrLine2, City, State, Zip, Country] = [
    ...item._data.split(';'),
    ...'       '.split(' '),
  ];

  const formattedValue =
    item.label ||
    [
      [A, AddrLine1].filter(a => a.length).join(' '),
      [AddrLine2].join(' '),
      [City, State, Zip].filter(a => a.length).join(' '),
      [Country].join(' '),
    ]
      .filter(l => l.length)
      .join('\n')
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',');

  return {
    city: City,
    country: Country,
    postalCode: Zip,
    region: State,
    streetAddress: AddrLine1,
    extendedAddress: AddrLine2,
    formattedValue: formattedValue,
    formattedType: parseFormattedType(item.type),
  } as ContactBase['addresses'][0];
};

export const parseFormattedType = (value: string) => {
  return asArray(value).filter(v => v !== 'internet' && v !== 'pref')[0];
};

export const parseValueAndTypeCollection = (items: any[]) => {
  return (
    items.length > 0 &&
    items.map(item => ({
      value: item._data,
      formattedType: parseFormattedType(item.type),
    }))
  );
};
