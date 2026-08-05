export type AdminCatalogTemplate =
  "equipment" | "courses" | "rooms" | "personnel";

type TemplateDefinition = {
  filename: string;
  sheetName: string;
  headers: string[];
  samples: Array<Record<string, string | number>>;
  widths: number[];
  instructions: string[][];
};

export const personnelRoleDisplayNames = [
  "Quản trị viên",
  "Giảng viên",
  "Chuyên viên",
  "Trợ giảng",
  "Người xem",
] as const;

type PersonnelTemplateRoomType = {
  code: string;
  name: string;
};

export function buildCourseTemplateSamples(
  roomTypes: PersonnelTemplateRoomType[],
): Array<Record<string, string>> {
  const nursingRoomType =
    roomTypes.find(({ code }) => code === "nursing_skills")?.name ??
    roomTypes[0]?.name ??
    "Kỹ năng Điều dưỡng";
  const basicMedicalRoomType =
    roomTypes.find(({ code }) => code === "basic_medical")?.name ??
    roomTypes.find(({ name }) => name !== nursingRoomType)?.name ??
    "Y cơ sở";

  return [
    {
      "Mã môn học": "NUR 101",
      "Tên môn học": "Thăm khám thể chất",
      Loại: nursingRoomType,
    },
    {
      "Mã môn học": "BSC 112",
      "Tên môn học": "Giáo dục sức khỏe trong thực hành điều dưỡng",
      Loại: basicMedicalRoomType,
    },
  ];
}

export function buildPersonnelTemplateSamples(
  roomTypes: PersonnelTemplateRoomType[],
): Array<Record<string, string>> {
  const fallbackRoomType = "Kỹ năng Điều dưỡng";
  const nursingRoomType =
    roomTypes.find(({ code }) => code === "nursing_skills")?.name ??
    roomTypes[0]?.name ??
    fallbackRoomType;
  const basicMedicalRoomType =
    roomTypes.find(({ code }) => code === "basic_medical")?.name ??
    roomTypes.find(({ name }) => name !== nursingRoomType)?.name;
  const allRoomTypes = [...new Set(roomTypes.map(({ name }) => name))];
  const assignedRoomTypes =
    allRoomTypes.length > 0
      ? allRoomTypes.join(", ")
      : [nursingRoomType, basicMedicalRoomType].filter(Boolean).join(", ");

  return [
    {
      "Họ và tên": "Nguyễn Văn A",
      "Email đăng nhập": "vidu.giangvien@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0901234567",
      "Chức danh": "Giảng viên",
      "Vai trò": "Giảng viên",
      "Loại phòng": nursingRoomType,
      "Loại phòng nhận email": "",
      "Quyền Y cơ sở": "Không",
    },
    {
      "Họ và tên": "Trần Thị B",
      "Email đăng nhập": "vidu.nhanvien@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0912345678",
      "Chức danh": "Chuyên viên",
      "Vai trò": "Chuyên viên",
      "Loại phòng": assignedRoomTypes,
      "Loại phòng nhận email": "",
      "Quyền Y cơ sở": "Có",
    },
    {
      "Họ và tên": "Lê Minh C",
      "Email đăng nhập": "vidu.quantri@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0923456789",
      "Chức danh": "Quản trị hệ thống",
      "Vai trò": "Quản trị viên",
      "Loại phòng": assignedRoomTypes,
      "Loại phòng nhận email": "",
      "Quyền Y cơ sở": "Có",
    },
    {
      "Họ và tên": "Phạm Ngọc D",
      "Email đăng nhập": "vidu.taophieu@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0934567890",
      "Chức danh": "Trợ giảng",
      "Vai trò": "Trợ giảng",
      "Loại phòng": basicMedicalRoomType ?? nursingRoomType,
      "Loại phòng nhận email": "",
      "Quyền Y cơ sở": basicMedicalRoomType ? "Có" : "Không",
    },
    {
      "Họ và tên": "Võ Thùy E",
      "Email đăng nhập": "vidu.nguoixem.khongmail@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0945678901",
      "Chức danh": "Người xem lịch",
      "Vai trò": "Người xem",
      "Loại phòng": assignedRoomTypes,
      "Loại phòng nhận email": "",
      "Quyền Y cơ sở": "Không",
    },
    {
      "Họ và tên": "Đỗ Anh F",
      "Email đăng nhập": "vidu.nguoixem.comail@eiu.edu.vn",
      "Mật khẩu tạm": "TempPass123!",
      "Số điện thoại": "0956789012",
      "Chức danh": "Người xem lịch",
      "Vai trò": "Người xem",
      "Loại phòng": assignedRoomTypes,
      "Loại phòng nhận email": nursingRoomType,
      "Quyền Y cơ sở": "Không",
    },
  ];
}

export const adminCatalogTemplates: Record<
  AdminCatalogTemplate,
  TemplateDefinition
> = {
  equipment: {
    filename: "template-import-danh-muc-thiet-bi.xlsx",
    sheetName: "Danh mục thiết bị",
    headers: [
      "Tên thiết bị và vật tư",
      "Tên thương mại",
      "Loại",
      "Nước SX",
      "Hãng",
      "Model",
      "ĐVT",
    ],
    samples: [
      {
        "Tên thiết bị và vật tư": "Mô hình hồi sức tim phổi",
        "Tên thương mại": "Little Anne QCPR",
        Loại: "Mô hình",
        "Nước SX": "Na Uy",
        Hãng: "Laerdal",
        Model: "Little Anne QCPR",
        ĐVT: "Bộ",
      },
    ],
    widths: [38, 30, 18, 16, 22, 22, 12],
    instructions: [
      ["Tên thiết bị và vật tư", "Có", "Tên dùng để tìm và phân loại thiết bị"],
      ["Tên thương mại", "Không", "Tên sản phẩm/thương mại"],
      ["Loại", "Không", "Ví dụ: Mô hình, Vật tư, Dụng cụ"],
      ["Nước SX", "Không", "Nước sản xuất"],
      ["Hãng", "Không", "Hãng sản xuất"],
      ["Model", "Không", "Mã model"],
      ["ĐVT", "Có", "Đơn vị tính"],
    ],
  },
  courses: {
    filename: "template-import-danh-muc-mon-hoc.xlsx",
    sheetName: "Danh mục môn học",
    headers: ["Mã môn học", "Tên môn học", "Loại"],
    samples: buildCourseTemplateSamples([
      { code: "nursing_skills", name: "Kỹ năng Điều dưỡng" },
      { code: "basic_medical", name: "Y cơ sở" },
    ]),
    widths: [20, 48, 28],
    instructions: [
      [
        "Mã môn học",
        "Có",
        "Mã duy nhất; trùng mã sẽ cập nhật tên môn học và Loại",
      ],
      ["Tên môn học", "Có", "Tên đầy đủ của môn học"],
      ["Loại", "Có", "Dùng đúng tên trong danh sách Loại bên dưới"],
    ],
  },
  rooms: {
    filename: "template-import-danh-muc-phong.xlsx",
    sheetName: "Danh mục phòng",
    headers: ["Mã phòng", "Tòa nhà", "Tên phòng", "Loại phòng", "Sức chứa"],
    samples: [
      {
        "Mã phòng": "105",
        "Tòa nhà": "B5",
        "Tên phòng": "Skills Lab 105",
        "Loại phòng": "Kỹ năng Điều dưỡng",
        "Sức chứa": 30,
      },
    ],
    widths: [18, 16, 36, 24, 14],
    instructions: [
      ["Mã phòng", "Có", "Kết hợp Mã phòng + Tòa nhà phải là duy nhất"],
      ["Tòa nhà", "Có", "Ví dụ: B5, A2"],
      ["Tên phòng", "Không", "Tên mô tả của phòng"],
      ["Loại phòng", "Có", "Dùng đúng tên trong danh sách Loại phòng bên dưới"],
      ["Sức chứa", "Không", "Số nguyên dương"],
    ],
  },
  personnel: {
    filename: "template-import-nhan-su.xlsx",
    sheetName: "Nhân sự",
    headers: [
      "Họ và tên",
      "Email đăng nhập",
      "Mật khẩu tạm",
      "Số điện thoại",
      "Chức danh",
      "Vai trò",
      "Loại phòng",
      "Loại phòng nhận email",
      "Quyền Y cơ sở",
    ],
    samples: buildPersonnelTemplateSamples([
      { code: "nursing_skills", name: "Kỹ năng Điều dưỡng" },
      { code: "basic_medical", name: "Y cơ sở" },
    ]),
    widths: [28, 34, 22, 18, 24, 28, 30, 30, 18],
    instructions: [
      ["Họ và tên", "Có", "Họ tên hiển thị của nhân sự"],
      [
        "Email đăng nhập",
        "Có",
        "Email hợp lệ; hệ thống chuyển về chữ thường và dùng làm khóa đối chiếu khi import",
      ],
      [
        "Mật khẩu tạm",
        "Khi tạo mới",
        "Tối thiểu 8 ký tự; không thay đổi mật khẩu của tài khoản đã có",
      ],
      [
        "Số điện thoại",
        "Không",
        "Nên dùng 10 chữ số; đặt ô dạng Text để giữ số 0 ở đầu. Email và số điện thoại phải duy nhất trong file",
      ],
      ["Chức danh", "Không", "Ví dụ: Giảng viên, Chuyên viên"],
      [
        "Vai trò",
        "Có",
        "Dùng đúng tên trong danh sách vai trò bên dưới. Có thể nhập nhiều vai trò, ngăn cách bằng dấu phẩy; riêng Người xem phải đứng một mình",
      ],
      [
        "Loại phòng",
        "Có",
        "Một hoặc nhiều tên loại phòng, ngăn cách bằng dấu phẩy",
      ],
      [
        "Loại phòng nhận email",
        "Không",
        "Chỉ dành cho Người xem. Để trống nếu không nhận email; nếu có thì chỉ dùng các tên đã nhập trong cột Loại phòng",
      ],
      [
        "Quyền Y cơ sở",
        "Không",
        "Nhập Có hoặc Không. Chỉ điều khiển quyền Tạo lịch Y cơ sở của Giảng viên/Trợ giảng thuộc loại phòng Y cơ sở; Lịch Y cơ sở và Phiếu Y cơ sở hiển thị theo Loại phòng đã phân công",
      ],
      [],
      [
        "Dòng ví dụ",
        "",
        "Sáu dòng trong sheet Nhân sự là ví dụ hợp lệ cho từng vai trò. Hãy thay bằng dữ liệu thật hoặc xóa các dòng không dùng trước khi import",
      ],
      [
        "Giới hạn",
        "",
        "Mỗi lần import tối đa 500 dòng. Hệ thống chỉ đọc sheet đầu tiên của file",
      ],
      [
        "Trạng thái tài khoản",
        "Hệ thống quản lý",
        "Tài khoản mới được kích hoạt; import không tự mở khóa hoặc khóa tài khoản hiện có",
      ],
      [
        "Import mới",
        "",
        "Chỉ thêm nhân sự mới và giữ nguyên toàn bộ dữ liệu hiện có. Nếu email hoặc số điện thoại trùng dữ liệu hiện có hay trùng trong file, toàn bộ file sẽ không được import",
      ],
      [
        "Import tất cả",
        "",
        "Thay toàn bộ danh sách nhân sự theo file và giữ nguyên các tài khoản Quản trị viên hiện có. Nhân sự cũ không có trong file sẽ bị khóa, gỡ vai trò và Loại phòng; dữ liệu lịch sử vẫn được bảo toàn",
      ],
      [
        "Quản trị viên khi Import tất cả",
        "Được giữ nguyên",
        "Không cần đưa các tài khoản Quản trị viên đang có vào file. Nếu có, hệ thống bỏ qua dòng đó và không thay đổi tài khoản quản trị",
      ],
    ],
  },
};

export function isAdminCatalogTemplate(
  value: string,
): value is AdminCatalogTemplate {
  return (
    value === "equipment" ||
    value === "courses" ||
    value === "rooms" ||
    value === "personnel"
  );
}
