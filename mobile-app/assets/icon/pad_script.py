from PIL import Image
import os

def pad_image(input_path, output_path, padding_factor=0.65):
    img = Image.open(input_path).convert("RGBA")
    
    # User's icon has a black background
    bg_color = img.getpixel((0,0))
    
    width, height = img.size
    
    new_canvas = Image.new("RGBA", (width, height), bg_color)
    
    new_w = int(width * padding_factor)
    new_h = int(height * padding_factor)
    resized_img = img.resize((new_w, new_h), Image.LANCZOS)
    
    x_offset = (width - new_w) // 2
    y_offset = (height - new_h) // 2
    
    new_canvas.paste(resized_img, (x_offset, y_offset))
    
    new_canvas.save(output_path)

if __name__ == "__main__":
    base_dir = r"c:\Users\abhay\Documents\VSCode\Major Project\raptor-bike\mobile_app\raptor_app\assets\icon"
    in_file = os.path.join(base_dir, "icon.png")
    out_file = os.path.join(base_dir, "icon_padded.png")
    pad_image(in_file, out_file)
    print("Padding script finished. Output:", out_file)
