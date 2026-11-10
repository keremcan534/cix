// The line that greets a person on Ana Sayfa: the time of day and their first name ("Günaydın, Ayşe"). Pure.

/** The greeting for an hour of the day (0–23), as people say it in Turkish. Late at night it is still "İyi
 *  akşamlar": "İyi geceler" is said when parting. */
export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/** The first word of a name ("Ayşe Nur Kaya" → "Ayşe"); empty for an empty name, and for the demo's own person,
 *  who is called "Sen" (you): "İyi günler, Sen" would read oddly. */
export const firstName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.toLocaleLowerCase('tr-TR') === 'sen' ? '' : first;
};

/** "Günaydın, Ayşe", or only "Günaydın" when the name is empty. */
export const greetingLine = (hour: number, name: string) => {
  const who = firstName(name);
  return who ? `${greetingFor(hour)}, ${who}` : greetingFor(hour);
};
