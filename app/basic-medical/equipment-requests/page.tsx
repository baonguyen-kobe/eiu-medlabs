import { redirect } from "next/navigation";
import { BasicMedicalEquipmentRegistrationPage } from "@/components/basic-medical-equipment-registration-page";
import { getViewer } from "@/lib/viewer";
import {
  canUseBasicMedicalEquipmentRegistration,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

type SearchParams = {
  session?: string;
  mode?: string;
  request?: string;
};

export default async function BasicMedicalEquipmentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [viewer, query] = await Promise.all([getViewer(), searchParams]);
  const roomTypeCodes = viewer.roomTypes.map(({ code }) => code);
  if (!canUseBasicMedicalEquipmentRegistration(viewer.roles, roomTypeCodes)) {
    redirect(defaultWorkspacePath(viewer.roles, roomTypeCodes));
  }

  return (
    <BasicMedicalEquipmentRegistrationPage
      viewer={viewer}
      sessionId={query.session}
      mode={query.mode}
      requestKey={query.request}
    />
  );
}
