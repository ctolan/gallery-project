import { Box, Grid } from '@mui/material';
import { ImageCard } from './ImageCard';

interface Image {
  id: string;
  url: string;
  title: string;
}

interface ImageGalleryProps {
  images: Image[];
  onImageClick?: (image: Image) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
  return (
    <Box sx={{ flexGrow: 1, p: 2 }}>
      <Grid container spacing={2}>
        {images.map((image) => (
          <Grid
            key={image.id}
            {...{
              item: true,
              xs: 12,
              sm: 6,
              md: 4,
              lg: 3
            }}
          >
            <ImageCard
              image={image.url}
              title={image.title}
              onClick={() => onImageClick?.(image)}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};