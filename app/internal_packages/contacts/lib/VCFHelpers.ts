import { ContactBase } from './ContactController';

export const asArray = (obj: any | Array<any>) => {
  if (obj instanceof Array) return obj;
  return obj ? [obj] : [];
};

export const asSingle = (obj: any | Array<any>) => {
  if (obj instanceof Array) return obj[0];
  return obj;
};

export const setArray = (
  attr: string,
  card: any,
  values: { value: string; formattedType?: string }[]
) => {
  values.forEach(({ value, formattedType }, idx) => {
    const params = {};
    if (formattedType) {
      params['type'] = formattedType;
    }
    if (idx === 0) {
      card.set(attr, value, params);
    } else {
      card.add(attr, value, params);
    }
  });
};

export const parseBirthday = (date: string) => {
  const [year, month, day] = [...date.split('-'), -1, -1, -1];
  return { year: Number(year), month: Number(month), day: Number(day) };
};

export const serializeBirthday = ({
  date,
}: {
  date: { year: number; month: number; day: number };
}) => {
  const td = (n: number, count: number) => {
    let clean = Number(n);
    if (isNaN(clean)) clean = 0;
    let str = clean.toString();
    if (str.length > count) str = str.slice(0, count);
    if (str.length < count) str = '0'.repeat(count - str.length) + str.length;
    return str;
  };
  return { value: `${td(date.year, 4)}-${td(date.month, 2)}-${td(date.day, 2)}` };
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

export const serializeAddress = (item: ContactBase['addresses'][0]) => {
  const value = [
    '',
    item.streetAddress,
    item.extendedAddress,
    item.city,
    item.region,
    item.postalCode,
    item.country,
  ].join(';');
  return { value, formattedType: item.formattedType };
};
