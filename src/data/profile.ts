import type { Profile } from "./types";

export const profile: Profile = {
  name: "Nguyễn Văn Nam",
  wordmark: "NAM",
  education: {
    program: {
      vi: "Mạng máy tính và Truyền thông",
      en: "Computer Networks and Data Communications",
    },
    institution: {
      vi: "Trường Đại học Công nghệ Thông tin · ĐHQG-HCM",
      en: "University of Information Technology · VNU-HCM",
    },
    status: {
      vi: "Sinh viên",
      en: "Student",
    },
  },
  eyebrow: {
    vi: "Sinh viên UIT · Mạng máy tính và Truyền thông",
    en: "Computer Networks and Data Communications student · UIT",
  },
  headline: {
    vi: ["Chào bạn, mình là Nam."],
    en: ["Hi, I’m Nam."],
  },
  intro: {
    vi: "Mình học mạng máy tính tại UIT và thích tìm hiểu cách các hệ thống hoạt động.",
    en: "I’m studying computer networks at UIT and like figuring out how systems work.",
  },
  practice: {
    vi: "Trong các dự án ứng dụng, mình phát triển giao diện và cùng xây dựng backend. Với HealthOS, mình còn tham gia thiết lập hạ tầng.",
    en: "In application projects, I develop interfaces and collaborate on the backend. On HealthOS, I also contribute to infrastructure setup.",
  },
  aboutIntro: {
    vi: "Mình đang học ngành Mạng máy tính và Truyền thông tại Trường Đại học Công nghệ Thông tin, ĐHQG-HCM.",
    en: "I’m studying Computer Networks and Data Communications at the University of Information Technology, VNU-HCM.",
  },
  learning: {
    vi: "Mình thích hiểu dữ liệu đi qua mạng như thế nào và các phần của một hệ thống kết nối ra sao. Làm dự án giúp mình thử lại những điều đã học, rồi tìm hiểu vì sao một cách làm được chọn.",
    en: "I like understanding how data moves through a network and how the parts of a system connect. Projects help me put what I learn into practice and explore why one approach is chosen.",
  },
  storyTitle: {
    vi: "Website mở được nhưng danh sách sản phẩm trống",
    en: "The page opened, but the product list was empty",
  },
  story: {
    vi: [
      "Lần đầu đưa một website lên mạng, mình gửi đường dẫn cho một người bạn xem thử. Một lúc sau, bạn gửi lại ảnh chụp màn hình: trang mở được, nhưng danh sách sản phẩm trống trơn. Trên máy mình, mọi thứ vẫn bình thường. Mình còn tải lại vài lần, như thể như vậy đủ để chứng minh lỗi không nằm ở phía mình.",
      "Cuối cùng, mình tìm ra một địa chỉ API vẫn để localhost. Giao diện đã lên mạng, nhưng mình chưa thiết lập đúng cách để nó lấy dữ liệu bên ngoài môi trường phát triển. Điều làm mình nhớ không chỉ là lỗi cấu hình, mà là trước đó mình thực sự nghĩ website đã xong.",
      "Sau lần ấy, mình mở tab Network nhiều hơn: xem request được gửi đi đâu, nhận về gì và dừng ở đoạn nào. Địa chỉ, cổng kết nối và cấu hình máy chủ từng là những phần mình làm theo hướng dẫn cho qua. Bây giờ, mình muốn hiểu rõ vì sao chúng hoạt động.",
      "Mình vẫn thích làm ra một giao diện đẹp. Nhưng mình còn muốn biết điều gì xảy ra sau mỗi lần người dùng bấm nút. Câu “trên máy mình vẫn chạy” trở thành lời nhắc rằng vẫn còn những điều cần kiểm tra.",
    ],
    en: [
      "The first time I put a website online, I sent the link to a friend. They sent back a screenshot: the page opened, but the product list was empty. Everything still looked normal on my computer. I even refreshed a few times, as if that could prove the problem was somewhere else.",
      "Eventually, I found an API address still pointing to localhost. The interface was online, but I had not configured it to fetch data outside my development environment. What stayed with me was that, until then, I really thought the website was finished.",
      "After that, I started opening the Network tab more often, following where requests went, what came back and where they stopped. Addresses, ports and server configuration had been things I copied from instructions to get through the setup. Now I wanted to understand why they worked.",
      "I still enjoy making an interface look good. I also want to understand what happens after someone presses a button. “It works on my computer” has become a reminder that there is more to check.",
    ],
  },
  direction: {
    vi: "Trước mắt, mình muốn hiểu chắc hơn về mạng máy tính và hệ thống. Từ đó, mình tìm hiểu thêm về cloud, tự động hóa và vận hành hạ tầng.",
    en: "For now, I want to deepen my understanding of networks and systems. From there, I’m exploring cloud, automation and infrastructure operations.",
  },
  directionChain: {
    vi: "Networking → Systems → Cloud / Cloud-Native → DevOps / DevSecOps → SRE / Infrastructure",
    en: "Networking → Systems → Cloud / Cloud-Native → DevOps / DevSecOps → SRE / Infrastructure",
  },
  toolsDescription: {
    vi: "Mình mở tab Network để xem request được gửi đi đâu, nhận về gì và dừng ở đoạn nào.",
    en: "I use the Network tab to follow where requests go, what comes back and where they stop.",
  },
  exploration: {
    vi: "Mình đang tìm hiểu Agentic AI và AIOps, nhất là cách AI hỗ trợ giám sát và vận hành hệ thống. Mình cũng quan tâm đến cloud-native và Kubernetes: cách triển khai, tự động hóa và giữ hệ thống hoạt động tin cậy.",
    en: "I’m exploring Agentic AI and AIOps, especially how AI can help with monitoring and running systems. I’m also interested in cloud-native systems and Kubernetes: deployment, automation and reliability.",
  },
  photographyIntro: {
    vi: "Ngoài kỹ thuật, mình thích chụp ảnh.",
    en: "Outside of technology, I enjoy photography.",
  },
  contacts: [
    {
      contactId: "email",
      label: {
        vi: "namnguyen17062006@gmail.com",
        en: "namnguyen17062006@gmail.com",
      },
      href: "mailto:namnguyen17062006@gmail.com",
      enabled: true,
    },
    {
      contactId: "github",
      label: {
        vi: "GitHub",
        en: "GitHub",
      },
      href: "https://github.com/siinn1706",
      enabled: true,
    },
    {
      contactId: "phone",
      label: {
        vi: "0976 437 371",
        en: "+84 976 437 371",
      },
      href: "https://zalo.me/0976437371",
      enabled: true,
    },
    {
      contactId: "facebook",
      label: {
        vi: "Facebook",
        en: "Facebook",
      },
      href: "https://www.facebook.com/vannam176/",
      enabled: true,
    },
  ],
  cv: null,
  portraitMediaId: null,
};
