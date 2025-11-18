<?php

namespace Database\Seeders;

use App\Models\Post;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PostSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $posts = [
            [
                'title' => 'Giới thiệu về User Behavior Tracking',
                'content' => 'User Behavior Tracking là một công nghệ quan trọng trong việc phân tích hành vi người dùng trên website. Hệ thống này giúp chúng ta hiểu rõ hơn về cách người dùng tương tác với website, từ đó cải thiện trải nghiệm người dùng và tối ưu hóa chuyển đổi.

Các tính năng chính của hệ thống tracking bao gồm:
- Theo dõi các sự kiện click, scroll, input
- Capture screenshots tự động
- Phân tích hành vi người dùng theo thời gian thực
- Session replay để xem lại hành trình của người dùng

Với công nghệ này, các nhà phát triển và nhà thiết kế có thể hiểu rõ hơn về cách người dùng sử dụng sản phẩm của họ.',
                'excerpt' => 'Khám phá cách hệ thống User Behavior Tracking giúp phân tích và cải thiện trải nghiệm người dùng.',
                'author' => 'Admin',
                'published_at' => now()->subDays(5),
            ],
            [
                'title' => 'Cách tích hợp Tracker vào Website',
                'content' => 'Việc tích hợp tracker vào website rất đơn giản. Bạn chỉ cần thêm một vài dòng code JavaScript vào trang web của mình.

Bước 1: Thêm script tracker.js vào trang web
Bước 2: Khởi tạo tracker với cấu hình phù hợp
Bước 3: Kiểm tra kết nối với backend API

Với hệ thống này, bạn có thể dễ dàng theo dõi mọi tương tác của người dùng mà không cần thay đổi nhiều code hiện tại.',
                'excerpt' => 'Hướng dẫn chi tiết cách tích hợp hệ thống tracking vào website của bạn.',
                'author' => 'Developer',
                'published_at' => now()->subDays(4),
            ],
            [
                'title' => 'Privacy và Security trong Tracking',
                'content' => 'Khi triển khai hệ thống tracking, việc đảm bảo privacy và security là vô cùng quan trọng. Hệ thống này được thiết kế với các tính năng bảo vệ quyền riêng tư:

- Tự động mask các trường nhạy cảm như password, credit card
- Cho phép người dùng opt-out thông qua data-tracker-ignore attribute
- Mã hóa dữ liệu trong quá trình truyền tải
- Tuân thủ các quy định về bảo vệ dữ liệu cá nhân

Chúng ta cần đảm bảo rằng việc tracking không vi phạm quyền riêng tư của người dùng.',
                'excerpt' => 'Tìm hiểu về các biện pháp bảo vệ privacy và security trong hệ thống tracking.',
                'author' => 'Security Expert',
                'published_at' => now()->subDays(3),
            ],
            [
                'title' => 'Phân tích dữ liệu Tracking',
                'content' => 'Sau khi thu thập dữ liệu tracking, việc phân tích và hiểu được insights từ dữ liệu này là bước quan trọng tiếp theo.

Các loại phân tích phổ biến:
- Heatmaps: Xem nơi người dùng click nhiều nhất
- Scroll maps: Hiểu được người dùng scroll đến đâu
- Session replay: Xem lại toàn bộ hành trình của người dùng
- Funnel analysis: Phân tích conversion funnel

Với các công cụ phân tích này, bạn có thể đưa ra các quyết định dựa trên dữ liệu thực tế.',
                'excerpt' => 'Cách phân tích và tận dụng dữ liệu tracking để cải thiện website.',
                'author' => 'Data Analyst',
                'published_at' => now()->subDays(2),
            ],
            [
                'title' => 'Best Practices cho User Tracking',
                'content' => 'Để có được kết quả tốt nhất từ hệ thống tracking, bạn cần tuân theo một số best practices:

1. Chỉ track những gì cần thiết - không track quá nhiều dữ liệu không cần thiết
2. Tối ưu performance - đảm bảo tracking không làm chậm website
3. Bảo vệ privacy - luôn thông báo và cho phép người dùng opt-out
4. Phân tích định kỳ - xem xét dữ liệu thường xuyên để tìm insights
5. Hành động dựa trên dữ liệu - không chỉ thu thập mà còn sử dụng dữ liệu để cải thiện

Những best practices này sẽ giúp bạn có được hệ thống tracking hiệu quả và đáng tin cậy.',
                'excerpt' => 'Những thực hành tốt nhất khi triển khai hệ thống user tracking.',
                'author' => 'Product Manager',
                'published_at' => now()->subDays(1),
            ],
            [
                'title' => 'Session Replay: Xem lại hành trình người dùng',
                'content' => 'Session Replay là một tính năng mạnh mẽ cho phép bạn xem lại toàn bộ hành trình của người dùng trên website như một video. Điều này giúp bạn:

- Hiểu được vấn đề người dùng gặp phải
- Tìm ra các điểm friction trong user journey
- Xem cách người dùng thực sự sử dụng sản phẩm
- Debug các vấn đề kỹ thuật một cách dễ dàng

Với session replay, bạn có thể "đi bộ trong đôi giày của người dùng" và hiểu được trải nghiệm thực tế của họ.',
                'excerpt' => 'Khám phá tính năng Session Replay và cách nó giúp cải thiện sản phẩm.',
                'author' => 'UX Designer',
                'published_at' => now()->subHours(12),
            ],
            [
                'title' => 'Tối ưu Performance của Tracker',
                'content' => 'Performance là một yếu tố quan trọng khi triển khai tracking. Một tracker chậm có thể ảnh hưởng đến trải nghiệm người dùng.

Các kỹ thuật tối ưu:
- Batch events thay vì gửi từng event một
- Throttle mouse move events
- Lazy load tracking script
- Compress screenshots
- Sử dụng Web Workers cho xử lý nặng

Với các kỹ thuật này, bạn có thể có một hệ thống tracking mạnh mẽ mà không ảnh hưởng đến performance của website.',
                'excerpt' => 'Các kỹ thuật tối ưu performance cho hệ thống tracking.',
                'author' => 'Performance Engineer',
                'published_at' => now()->subHours(6),
            ],
            [
                'title' => 'A/B Testing với Tracking Data',
                'content' => 'Dữ liệu tracking có thể được sử dụng để thực hiện A/B testing hiệu quả. Bằng cách so sánh hành vi người dùng giữa các phiên bản khác nhau, bạn có thể:

- Xác định phiên bản nào hoạt động tốt hơn
- Hiểu được lý do tại sao một phiên bản tốt hơn
- Đưa ra quyết định dựa trên dữ liệu thực tế
- Giảm thiểu rủi ro khi thay đổi

A/B testing kết hợp với tracking data là một công cụ mạnh mẽ để cải thiện conversion rate và user experience.',
                'excerpt' => 'Cách sử dụng dữ liệu tracking để thực hiện A/B testing hiệu quả.',
                'author' => 'Growth Hacker',
                'published_at' => now()->subHours(3),
            ],
            [
                'title' => 'Mobile Tracking: Thách thức và Giải pháp',
                'content' => 'Tracking trên mobile có những thách thức riêng so với desktop:

- Màn hình nhỏ hơn, ít không gian để hiển thị
- Touch events thay vì mouse events
- Network connection không ổn định
- Battery consumption

Giải pháp:
- Tối ưu cho touch events
- Giảm tần suất tracking trên mobile
- Sử dụng local storage để cache events
- Adaptive tracking dựa trên network condition

Với các giải pháp này, bạn có thể có được tracking hiệu quả trên cả desktop và mobile.',
                'excerpt' => 'Những thách thức và giải pháp khi tracking trên mobile devices.',
                'author' => 'Mobile Developer',
                'published_at' => now()->subHours(2),
            ],
            [
                'title' => 'Tương lai của User Tracking',
                'content' => 'Tương lai của user tracking sẽ hướng tới:

- AI-powered insights: Sử dụng AI để phân tích và đưa ra insights tự động
- Real-time analytics: Phân tích dữ liệu theo thời gian thực
- Privacy-first tracking: Tracking mà vẫn đảm bảo privacy
- Cross-platform tracking: Tracking xuyên suốt các platform
- Predictive analytics: Dự đoán hành vi người dùng

Với những xu hướng này, user tracking sẽ trở nên thông minh hơn, chính xác hơn và tôn trọng privacy hơn.',
                'excerpt' => 'Những xu hướng và tương lai của công nghệ user tracking.',
                'author' => 'Tech Futurist',
                'published_at' => now()->subHour(1),
            ],
            [
                'title' => 'Case Study: Cải thiện Conversion Rate với Tracking',
                'content' => 'Một case study thực tế về cách sử dụng tracking để cải thiện conversion rate:

Vấn đề: Conversion rate thấp, không biết người dùng rời bỏ ở đâu
Giải pháp: Triển khai tracking và phân tích session replay
Kết quả: Tìm ra được điểm friction chính, cải thiện conversion rate lên 35%

Bài học:
- Tracking giúp tìm ra vấn đề thực sự
- Session replay cho thấy hành vi thực tế của người dùng
- Dữ liệu thực tế quan trọng hơn assumptions
- Cải thiện nhỏ có thể tạo ra impact lớn',
                'excerpt' => 'Case study về cách sử dụng tracking để cải thiện conversion rate.',
                'author' => 'Business Analyst',
                'published_at' => now(),
            ],
            [
                'title' => 'Debugging với Tracking Data',
                'content' => 'Tracking data không chỉ hữu ích cho phân tích, mà còn rất hữu ích cho debugging:

- Xem lại các bước người dùng thực hiện trước khi gặp lỗi
- Hiểu được context của bug
- Reproduce bug dễ dàng hơn
- Tìm ra root cause nhanh hơn

Với tracking data, debugging trở nên dễ dàng và hiệu quả hơn nhiều.',
                'excerpt' => 'Cách sử dụng tracking data để debug hiệu quả hơn.',
                'author' => 'QA Engineer',
                'published_at' => now()->addHour(1),
            ],
            [
                'title' => 'GDPR và Compliance trong Tracking',
                'content' => 'Khi triển khai tracking, việc tuân thủ GDPR và các quy định về privacy là bắt buộc:

- Thông báo cho người dùng về tracking
- Cho phép người dùng opt-out
- Xóa dữ liệu khi người dùng yêu cầu
- Bảo vệ dữ liệu cá nhân
- Audit trail cho mọi thao tác

Tuân thủ các quy định này không chỉ là yêu cầu pháp lý, mà còn là cách xây dựng niềm tin với người dùng.',
                'excerpt' => 'Cách đảm bảo compliance với GDPR và các quy định privacy khi tracking.',
                'author' => 'Legal Advisor',
                'published_at' => now()->addHours(2),
            ],
            [
                'title' => 'Real-time Monitoring Dashboard',
                'content' => 'Dashboard monitoring theo thời gian thực giúp bạn:

- Theo dõi số lượng users đang online
- Xem các events đang xảy ra
- Phát hiện vấn đề ngay lập tức
- Phân tích trends theo thời gian thực

Với dashboard này, bạn có thể phản ứng nhanh với các vấn đề và tận dụng các cơ hội.',
                'excerpt' => 'Tìm hiểu về dashboard monitoring theo thời gian thực.',
                'author' => 'DevOps Engineer',
                'published_at' => now()->addHours(3),
            ],
            [
                'title' => 'Tích hợp Tracking với Analytics Tools',
                'content' => 'Tracking data có thể được tích hợp với các analytics tools khác như Google Analytics, Mixpanel, Amplitude:

- Export data sang các tools khác
- Kết hợp với data từ các nguồn khác
- Tạo comprehensive analytics view
- Sử dụng best practices từ các tools đã có

Việc tích hợp này giúp bạn có được cái nhìn toàn diện về user behavior.',
                'excerpt' => 'Cách tích hợp tracking data với các analytics tools phổ biến.',
                'author' => 'Data Engineer',
                'published_at' => now()->addHours(4),
            ],
        ];

        foreach ($posts as $postData) {
            // Generate slug if not provided
            if (empty($postData['slug'])) {
                $postData['slug'] = Str::slug($postData['title']);
            }
            Post::create($postData);
        }
    }
}
