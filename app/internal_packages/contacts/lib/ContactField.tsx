import React from 'react';

/** An outlined form field whose label sits in the top border, so every input in the
editor has the same height and baseline regardless of whether it has a value. */
export const ContactField: React.FunctionComponent<{
  label: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, className, children }) => (
  <label className={`contact-field ${className || ''}`}>
    <span className="contact-field-label">{label}</span>
    {children}
  </label>
);

export const ContactTextField = ({
  label,
  value,
  onChange,
  className,
  type = 'text',
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
}) => (
  <ContactField label={label} className={className}>
    <input type={type} value={value || ''} onChange={(e) => onChange(e.currentTarget.value)} />
  </ContactField>
);
