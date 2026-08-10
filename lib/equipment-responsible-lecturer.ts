type LecturerOption = {
  id: string;
  full_name: string;
};

export function responsibleLecturerOptions(
  lecturers: LecturerOption[],
  registrantId: string,
) {
  return lecturers.map((person) => ({
    ...person,
    full_name:
      person.id === registrantId
        ? `${person.full_name} (Người đăng ký)`
        : person.full_name,
  }));
}

export function defaultResponsibleLecturerId(
  options: LecturerOption[],
  registrantId: string,
  initialResponsibleLecturerId?: string,
) {
  if (
    initialResponsibleLecturerId &&
    options.some(({ id }) => id === initialResponsibleLecturerId)
  ) {
    return initialResponsibleLecturerId;
  }
  return (
    options.find(({ id }) => id === registrantId)?.id ?? options[0]?.id ?? ""
  );
}
