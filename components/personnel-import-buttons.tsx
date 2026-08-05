"use client";

import { UploadCloud } from "@/components/icons";

export function PersonnelImportButtons() {
  return (
    <>
      <button className="button equipment-import-new" name="mode" value="new">
        <UploadCloud size={17} /> Import mới
      </button>
      <button
        className="button equipment-import-all"
        name="mode"
        value="all"
        onClick={(event) => {
          if (
            !window.confirm(
              "Import tất cả sẽ thay toàn bộ danh sách nhân sự hiện tại, chỉ giữ nguyên tài khoản Quản trị viên. Bạn có chắc muốn tiếp tục?",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <UploadCloud size={17} /> Import tất cả
      </button>
    </>
  );
}
