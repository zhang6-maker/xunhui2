import sys, json, os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.shapes import PP_PLACEHOLDER

sys.stdout.reconfigure(encoding='utf-8')

# 获取脚本所在目录，用于定位默认图片
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def add_emotion_image(slide, emotion, custom_path=None):
    """在幻灯片右下角添加寻慧表情包"""
    # 映射情绪到文件名
    emotion_map = {
        'neutral': 'idle.gif',
        'thinking': 'think.gif',
        'success': 'dance.gif',
        'warning': 'disgust.gif',
        'working': 'work.gif',
        'relax': 'stretch.gif'
    }
    img_name = emotion_map.get(emotion, 'idle.gif')
    
    # 优先使用传入的绝对路径，否则在 v2/images/ 找
    img_path = custom_path if custom_path and os.path.exists(custom_path) else os.path.join(SCRIPT_DIR, 'images', img_name)
    
    if os.path.exists(img_path):
        try:
            # 位置：右下角 (10英寸宽, 5.625英寸高 是 16:9 的标准尺寸)
            # 宽 1.0, 高 1.0
            slide.shapes.add_picture(img_path, Inches(8.8), Inches(4.5), width=Inches(0.8), height=Inches(0.8))
        except Exception as e:
            print(f"Warning: Failed to add image {img_path}: {e}")

def find_title_and_body(slide):
    """返回 (标题形状, 正文形状)"""
    title_shape = None
    body_shape = None
    
    # 1. 优先使用内置的 title 占位符
    if slide.shapes.title:
        title_shape = slide.shapes.title
    
    # 2. 遍历形状找占位符
    for shape in slide.shapes:
        if not shape.is_placeholder:
            continue
        # 如果还没找到标题，且当前是标题类占位符
        if not title_shape and shape.placeholder_format.type in [PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE]:
            title_shape = shape
        # 寻找正文/主体占位符
        elif not body_shape and shape.placeholder_format.type in [PP_PLACEHOLDER.BODY, PP_PLACEHOLDER.OBJECT]:
            body_shape = shape

    # 3. 启发式搜索：如果没有占位符，按位置和大小找
    if not title_shape or not body_shape:
        text_shapes = [s for s in slide.shapes if s.has_text_frame]
        # 按 top 排序
        text_shapes.sort(key=lambda s: s.top or 0)
        
        if not title_shape and text_shapes:
            # 认为最靠上的那个是标题
            title_shape = text_shapes[0]
            text_shapes.pop(0)
            
        if not body_shape and text_shapes:
            # 认为剩下的面积最大的那个是正文
            text_shapes.sort(key=lambda s: (s.width or 0) * (s.height or 0), reverse=True)
            body_shape = text_shapes[0]
    
    return title_shape, body_shape

def replace_text_preserve_first_run_format(shape, new_text):
    """替换文本，保留格式。如果文本包含换行符，则分段处理"""
    if not shape.has_text_frame:
        return
    tf = shape.text_frame
    
    # 先记录第一个段落第一个 run 的格式（如果存在）
    font_name = None
    font_size = None
    if tf.paragraphs and tf.paragraphs[0].runs:
        r = tf.paragraphs[0].runs[0]
        font_name = r.font.name
        font_size = r.font.size

    # 清空
    tf.clear() 
    
    # 重新添加内容
    lines = new_text.split('\n')
    for i, line in enumerate(lines):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.text = line
        if font_name: p.font.name = font_name
        if font_size: p.font.size = font_size

def auto_fill_slide(slide, title_text, content_text, emotion=None):
    """智能填充一页幻灯片：找标题/正文文本框并替换"""
    title_shape, body_shape = find_title_and_body(slide)

    filled = False
    if title_shape:
        replace_text_preserve_first_run_format(title_shape, title_text)
        filled = True

    if body_shape:
        replace_text_preserve_first_run_format(body_shape, content_text)
        filled = True

    # 插入表情包
    if emotion:
        add_emotion_image(slide, emotion)

    # 降级：如果没找到任何可填充的，就在中间加一个
    if not filled:
        add_slide_content_box(slide, title_text + "\n\n" + content_text)
        filled = True

    return filled

def add_slide_content_box(slide, text):
    txBox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(5))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.add_paragraph()
    p.text = text
    p.font.size = Pt(18)

def add_slide_with_text(prs, title_text, content_text, emotion=None):
    """追加一页新幻灯片"""
    # 尝试寻找带标题和正文的布局，通常是布局 1
    layout_idx = 1 if len(prs.slide_layouts) > 1 else 0
    slide = prs.slides.add_slide(prs.slide_layouts[layout_idx])
    
    title_shape, body_shape = find_title_and_body(slide)
    if title_shape:
        replace_text_preserve_first_run_format(title_shape, title_text)
    if body_shape:
        replace_text_preserve_first_run_format(body_shape, content_text)
    
    if emotion:
        add_emotion_image(slide, emotion)

def fill_template(template_path, output_path, json_path):
    with open(json_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)

    slides_data = data.get('slides', [])
    if not slides_data:
        # 兼容旧格式
        title = data.get('title', '未命名')
        content = data.get('content', '')
        slides_data = [{'title': title, 'content': content}]

    prs = Presentation(template_path)

    # 遍历生成的内容
    for i, slide_info in enumerate(slides_data):
        title_text = slide_info.get('title', '')
        emotion = slide_info.get('emotion', 'neutral')
        
        # 整合 body 和 points 为完整的 content_text
        body = slide_info.get('body', '')
        points = slide_info.get('points', [])
        content_parts = []
        if body: content_parts.append(body)
        if points and isinstance(points, list):
            content_parts.append("\n".join([f"• {p}" for p in points]))
        
        content_text = "\n\n".join(content_parts)

        # 如果模板里有这一页，尝试智能填充
        if i < len(prs.slides):
            slide = prs.slides[i]
            auto_fill_slide(slide, title_text, content_text, emotion)
        else:
            # 如果模板页数不够，追加新页
            add_slide_with_text(prs, title_text, content_text, emotion)

    prs.save(output_path)
    print(f"Generated: {output_path}")

    prs.save(output_path)
    print(f"Generated: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("用法: python fill_ppt.py <模板路径> <输出路径> <JSON文件路径>")
        sys.exit(1)
    fill_template(sys.argv[1], sys.argv[2], sys.argv[3])