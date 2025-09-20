import { Card, CardMedia, CardActionArea, CardContent, Typography } from '@mui/material';

interface ImageCardProps {
  image: string;
  title: string;
  onClick?: () => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ image, title, onClick }) => {
  return (
    <Card sx={{ maxWidth: 345, m: 1 }}>
      <CardActionArea onClick={onClick}>
        <CardMedia
          component="img"
          height="200"
          image={image}
          alt={title}
        />
        <CardContent>
          <Typography gutterBottom variant="h6" component="div">
            {title}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};